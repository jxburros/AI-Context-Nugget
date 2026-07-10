import type {
  Chunker,
  ChunkerOptions,
  ContextChunk,
  ContextPack,
  ContextPacket,
  ContextSource,
  ContextStore,
  MemoryCandidate,
  MemoryPolicy,
  MemoryRecord,
  PackOptions,
  RetrievalQuery,
  RetrieveAndPackOptions,
  Retriever,
} from './types.js';
import { markdownChunker, textChunker } from './chunk.js';
import { bm25Retriever } from './retrieval/bm25.js';
import { keywordRetriever } from './retrieval/keyword.js';
import { hybridRetriever } from './retrieval/hybrid.js';
import { InMemoryContextStore } from './stores/memoryStore.js';
import { memoryRecordFromCandidate, memoryToChunk, shouldStoreMemory, manualMemoryPolicy } from './memory.js';
import { packetFromResults, packContext } from './pack.js';
import { rankResults } from './rank.js';
import { DEFAULT_STOPWORDS, tokenize } from './tokenize.js';

export interface ContextEngineOptions {
  store?: ContextStore;
  /** Default chunker used for every source kind unless overridden by `chunkerByKind`. */
  chunker?: Chunker;
  /** Per-`source.kind` chunker overrides. Takes precedence over `chunker`. */
  chunkerByKind?: Record<string, Chunker>;
  /** Default retriever, used when a query has no `strategy` or its strategy isn't in `retrievers`/a built-in. */
  retriever?: Retriever;
  /** Strategy name -> retriever. Consulted before built-in defaults, so injected options (e.g. `bm25Retriever({k1})`) are honored. */
  retrievers?: Record<string, Retriever>;
  memoryPolicy?: MemoryPolicy;
  chunkerOptions?: ChunkerOptions;
}

const BUILTIN_RETRIEVERS: Record<string, () => Retriever> = {
  keyword: () => keywordRetriever(),
  hybrid: () => hybridRetriever(),
  bm25: () => bm25Retriever(),
};

export class ContextEngine {
  readonly store: ContextStore;
  private readonly chunker?: Chunker;
  private readonly chunkerByKind: Record<string, Chunker>;
  private readonly retriever: Retriever;
  private readonly retrievers: Record<string, Retriever>;
  private readonly memoryPolicy: MemoryPolicy;
  private readonly defaultChunkerOptions: ChunkerOptions;

  constructor(options: ContextEngineOptions = {}) {
    this.store = options.store ?? new InMemoryContextStore();
    this.chunker = options.chunker;
    this.chunkerByKind = options.chunkerByKind ?? {};
    this.retriever = options.retriever ?? bm25Retriever();
    this.retrievers = options.retrievers ?? {};
    this.memoryPolicy = options.memoryPolicy ?? manualMemoryPolicy;
    this.defaultChunkerOptions = options.chunkerOptions ?? {};
  }

  /**
   * Resolves the chunker for a source kind: `chunkerByKind[kind]` wins over the
   * constructor's `chunker`, which wins over a kind-smart built-in default. An
   * explicitly configured chunker is therefore honored for every source kind,
   * including `markdown` — the kind-smart default only applies when the app
   * injected nothing.
   */
  private resolveChunker(kind: string): Chunker {
    return (
      this.chunkerByKind[kind] ??
      this.chunker ??
      (kind === 'markdown' ? markdownChunker(this.defaultChunkerOptions) : textChunker(this.defaultChunkerOptions))
    );
  }

  /**
   * Adds (or replaces) a source's chunks. Re-adding a source with the same id
   * removes its previously indexed chunks before chunking the new content, so
   * updated content never leaves stale chunks retrievable alongside it.
   */
  async addSource(source: ContextSource, options: ChunkerOptions = {}): Promise<void> {
    await this.store.addSource(source);
    await this.store.removeChunks({ sourceId: source.id });
    const chunker = this.resolveChunker(source.kind);
    const chunks = chunker.chunk(source, { ...this.defaultChunkerOptions, ...options });
    await this.store.addChunks(chunks);
  }

  async addSources(sources: ContextSource[], options: ChunkerOptions = {}): Promise<void> {
    for (const source of sources) await this.addSource(source, options);
  }

  /**
   * Adds (or replaces) a memory record's chunk. Re-adding a memory with the
   * same id removes its previous chunk first. Any record ids listed in
   * `record.supersedes` are marked `status: 'superseded'` and their chunks
   * are removed, so superseded memories never remain retrievable.
   */
  async addMemory(record: MemoryRecord): Promise<void> {
    await this.store.addMemory(record);
    await this.store.removeChunks({ memoryId: record.id });
    await this.store.addChunks([memoryToChunk(record)]);
    for (const supersededId of record.supersedes ?? []) {
      const superseded = await this.store.getMemory(supersededId);
      if (!superseded) continue;
      await this.store.addMemory({ ...superseded, status: 'superseded', updatedAt: record.updatedAt ?? record.createdAt });
      await this.store.removeChunks({ memoryId: supersededId });
    }
  }

  async removeSource(sourceId: string): Promise<void> {
    await this.store.removeSource(sourceId);
  }

  async removeMemory(memoryId: string): Promise<void> {
    await this.store.removeMemory(memoryId);
  }

  async suggestMemory(candidate: MemoryCandidate): Promise<{ decision: Awaited<ReturnType<typeof shouldStoreMemory>>; record?: MemoryRecord }> {
    const decision = await shouldStoreMemory(this.memoryPolicy, candidate);
    if (!decision.store) return { decision };
    const record = memoryRecordFromCandidate(candidate, decision);
    await this.addMemory(record);
    return { decision, record };
  }

  /**
   * Applies `memoryPolicy.shouldExpire`/`shouldRetrieve` to memory-backed chunks.
   * Non-memory chunks always pass through. Drops are recorded as diagnostics reasons.
   */
  private async filterByMemoryPolicy(chunks: ContextChunk[], query: RetrievalQuery): Promise<{ candidates: ContextChunk[]; reasons: string[] }> {
    const candidates: ContextChunk[] = [];
    const reasons: string[] = [];
    for (const chunk of chunks) {
      const memoryId = chunk.metadata?.memoryId;
      if (typeof memoryId !== 'string') {
        candidates.push(chunk);
        continue;
      }
      const record = await this.store.getMemory(memoryId);
      if (!record) {
        reasons.push(`memory ${memoryId} excluded: orphan chunk`);
        continue;
      }
      if (this.memoryPolicy.shouldExpire && (await this.memoryPolicy.shouldExpire(record))) {
        reasons.push(`memory ${memoryId} excluded by shouldExpire`);
        continue;
      }
      if (this.memoryPolicy.shouldRetrieve && !(await this.memoryPolicy.shouldRetrieve(record, query))) {
        reasons.push(`memory ${memoryId} excluded by shouldRetrieve`);
        continue;
      }
      candidates.push(chunk);
    }
    return { candidates, reasons };
  }

  /**
   * Resolves the retriever for a query: an explicit `retrievers[strategy]` wins,
   * then the configured default `retriever` when its own mode already matches the
   * requested strategy (so constructor-injected options like `bm25Retriever({k1})`
   * are honored), then a built-in default for well-known strategy names. A strategy
   * naming a mode nothing above provides degrades visibly to the configured default
   * instead of failing silently — this subsumes the semantic-retrieval fallback as
   * one case of the general rule.
   */
  private resolveRetriever(strategy: RetrievalQuery['strategy']): { retriever: Retriever; degraded: boolean; degradedReason?: string } {
    if (!strategy) return { retriever: this.retriever, degraded: false };
    const configured = this.retrievers[strategy];
    if (configured) return { retriever: configured, degraded: false };
    if (this.retriever.mode === strategy) return { retriever: this.retriever, degraded: false };
    const builtin = BUILTIN_RETRIEVERS[strategy];
    if (builtin) return { retriever: builtin(), degraded: false };
    return {
      retriever: this.retriever,
      degraded: true,
      degradedReason: `Retrieval strategy "${strategy}" is not configured; used the default retriever (${this.retriever.mode}) instead.`,
    };
  }

  async retrieve(query: RetrievalQuery): Promise<ContextPacket> {
    const rawChunks = await this.store.listChunks(query);
    const { candidates, reasons: policyReasons } = await this.filterByMemoryPolicy(rawChunks, query);

    const { retriever, degraded, degradedReason } = this.resolveRetriever(query.strategy);

    const queryReasons: string[] = [];
    if (query.strategy !== 'manual' && tokenize(query.query, { stopwords: DEFAULT_STOPWORDS }).length === 0) {
      queryReasons.push('query produced no searchable terms');
    }

    const rawResults = await retriever.retrieve(query, candidates);
    const ranked = rankResults(rawResults);
    return packetFromResults(ranked, {
      query: query.query,
      layers: query.layers,
      budget: query.budget,
      retrievalMode: retriever.mode,
      degraded,
      degradedReason,
      candidateChunks: candidates.length,
      diagnosticsReasons: [...queryReasons, ...policyReasons, ...ranked.flatMap((result) => result.reasons ?? [])].slice(0, 12),
    });
  }

  async retrieveAndPack(options: RetrieveAndPackOptions, packOptions?: PackOptions): Promise<ContextPack> {
    const packet = await this.retrieve(options);
    return packContext(packet, { ...(options.pack ?? {}), ...(packOptions ?? {}) });
  }
}

export function createContextEngine(options: ContextEngineOptions = {}): ContextEngine {
  return new ContextEngine(options);
}
