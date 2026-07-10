import type { Chunker, ChunkerOptions, ContextPack, ContextPacket, ContextSource, ContextStore, MemoryCandidate, MemoryPolicy, MemoryRecord, PackOptions, RetrievalQuery, RetrieveAndPackOptions, Retriever } from './types.js';
import { shouldStoreMemory } from './memory.js';
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
export declare class ContextEngine {
    readonly store: ContextStore;
    private readonly chunker?;
    private readonly chunkerByKind;
    private readonly retriever;
    private readonly retrievers;
    private readonly memoryPolicy;
    private readonly defaultChunkerOptions;
    constructor(options?: ContextEngineOptions);
    /**
     * Resolves the chunker for a source kind: `chunkerByKind[kind]` wins over the
     * constructor's `chunker`, which wins over a kind-smart built-in default. An
     * explicitly configured chunker is therefore honored for every source kind,
     * including `markdown` — the kind-smart default only applies when the app
     * injected nothing.
     */
    private resolveChunker;
    /**
     * Adds (or replaces) a source's chunks. Re-adding a source with the same id
     * removes its previously indexed chunks before chunking the new content, so
     * updated content never leaves stale chunks retrievable alongside it.
     */
    addSource(source: ContextSource, options?: ChunkerOptions): Promise<void>;
    addSources(sources: ContextSource[], options?: ChunkerOptions): Promise<void>;
    /**
     * Adds (or replaces) a memory record's chunk. Re-adding a memory with the
     * same id removes its previous chunk first. Any record ids listed in
     * `record.supersedes` are marked `status: 'superseded'` and their chunks
     * are removed, so superseded memories never remain retrievable.
     */
    addMemory(record: MemoryRecord): Promise<void>;
    removeSource(sourceId: string): Promise<void>;
    removeMemory(memoryId: string): Promise<void>;
    suggestMemory(candidate: MemoryCandidate): Promise<{
        decision: Awaited<ReturnType<typeof shouldStoreMemory>>;
        record?: MemoryRecord;
    }>;
    /**
     * Applies `memoryPolicy.shouldExpire`/`shouldRetrieve` to memory-backed chunks.
     * Non-memory chunks always pass through. Drops are recorded as diagnostics reasons.
     */
    private filterByMemoryPolicy;
    /**
     * Resolves the retriever for a query: an explicit `retrievers[strategy]` wins,
     * then the configured default `retriever` when its own mode already matches the
     * requested strategy (so constructor-injected options like `bm25Retriever({k1})`
     * are honored), then a built-in default for well-known strategy names. A strategy
     * naming a mode nothing above provides degrades visibly to the configured default
     * instead of failing silently — this subsumes the semantic-retrieval fallback as
     * one case of the general rule.
     */
    private resolveRetriever;
    retrieve(query: RetrievalQuery): Promise<ContextPacket>;
    retrieveAndPack(options: RetrieveAndPackOptions, packOptions?: PackOptions): Promise<ContextPack>;
}
export declare function createContextEngine(options?: ContextEngineOptions): ContextEngine;
