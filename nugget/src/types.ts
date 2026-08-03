import type { ContextManifest } from './manifest.js';
import type { MetadataPolicy } from './pack.js';

export type ContextTrust = 'trusted' | 'untrusted' | 'app' | 'user' | 'system';

/**
 * Authority classification for context content, independent of `ContextTrust`.
 * `trust` drives handling of retrieved text (fencing, labeling); `authorityClass`
 * records what kind of authority the content carries for audit and precedence
 * decisions. The two are deliberately separate fields and must not be collapsed.
 */
export type AuthorityClass =
  | 'application_policy'
  | 'project_instruction'
  | 'user_instruction'
  | 'tool_result'
  | 'derived_content'
  | 'agent_claim'
  | 'untrusted_content';

export interface ContextSource {
  id: string;
  kind: 'text' | 'markdown' | 'json' | 'file' | 'url' | 'memory' | 'app_state' | string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  trust?: ContextTrust;
  authorityClass?: AuthorityClass;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContextSourceRef {
  sourceId: string;
  sourceKind: string;
  title?: string;
  path?: string;
  url?: string;
  page?: number;
  lineStart?: number;
  lineEnd?: number;
  section?: string;
  paragraph?: number;
}

export type ContextLayer =
  | 'session'
  | 'user'
  | 'project'
  | 'app'
  | 'agent'
  | 'model'
  | 'documents'
  | 'artifacts'
  | 'external'
  | string;

export interface ContextChunk {
  id: string;
  source: ContextSourceRef;
  text: string;
  layer?: ContextLayer;
  trust?: ContextTrust;
  authorityClass?: AuthorityClass;
  metadata?: Record<string, unknown>;
  tokensEstimated?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Memory lifecycle status. Only `'active'` records are retrievable as chunks.
 * `'proposed'` and `'disputed'` support a governed write path (propose ->
 * approve/dispute); they are listable via `listMemories` with
 * `RetrievalQuery.memoryStatuses` but never reach packed context.
 */
export type MemoryStatus = 'active' | 'archived' | 'superseded' | 'proposed' | 'disputed';

export interface MemoryRecord {
  id: string;
  layer: ContextLayer;
  scope: string;
  text: string;
  source?: ContextSourceRef;
  tags?: string[];
  importance?: number;
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  status?: MemoryStatus;
  supersedes?: string[];
  /** Transaction time: when this fact was observed or recorded (ISO). Audit-only; no retrieval effect. */
  observedAt?: string;
  /** Valid time: the record applies only at reference times >= `validFrom`. */
  validFrom?: string;
  /** Valid time: the record stops applying at reference times >= `validTo`. */
  validTo?: string;
  /** Advisory review date; no retrieval effect (see `isDueForReview`). */
  reviewAt?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryCandidate {
  layer: ContextLayer;
  scope: string;
  text: string;
  source?: ContextSourceRef;
  tags?: string[];
  importance?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryDecision {
  store: boolean;
  /** True when the candidate was approved for a suggestion queue rather than stored directly (mode: 'suggested'). */
  suggested?: boolean;
  reason?: string;
  record?: Partial<MemoryRecord>;
}

export interface MemoryPolicy {
  mode: 'manual' | 'suggested' | 'auto';
  shouldStore?: (candidate: MemoryCandidate) => Promise<MemoryDecision> | MemoryDecision;
  shouldRetrieve?: (record: MemoryRecord, query: RetrievalQuery) => Promise<boolean> | boolean;
  shouldExpire?: (record: MemoryRecord) => Promise<boolean> | boolean;
}

export interface RetrievalQuery {
  query: string;
  layers?: ContextLayer[];
  filters?: Record<string, unknown>;
  budget?: ContextBudget;
  topK?: number;
  minScore?: number;
  strategy?: 'keyword' | 'bm25' | 'semantic' | 'hybrid' | 'manual' | string;
  scope?: string;
  /**
   * Reference time (ISO) for bitemporal filtering. Memory records with
   * `expiresAt`/`validFrom`/`validTo` windows are evaluated against this
   * instant instead of the current time. Sources are not asOf-filtered.
   */
  asOf?: string;
  /**
   * Statuses visible to `listMemories` (default `['active']`, which also
   * applies expiry/validity windows). Chunk retrieval always requires
   * `'active'` regardless of this field.
   */
  memoryStatuses?: MemoryStatus[];
  /** Ranking options threaded by `ContextEngine.retrieve` into `rankResults`. */
  rank?: RankOptions;
}

export interface RetrievalResult {
  chunk: ContextChunk;
  score: number;
  scoreBreakdown?: Record<string, number>;
  reasons?: string[];
  layer?: ContextLayer;
  retrievalMode: 'keyword' | 'bm25' | 'semantic' | 'hybrid' | 'manual' | 'recency' | string;
}

export interface ContextBudget {
  maxTokens?: number;
  maxChars?: number;
  maxItems?: number;
  maxItemsPerSource?: number;
  reserveTokens?: number;
}

export interface Citation {
  id: string;
  label: string;
  source: ContextSourceRef;
}

export interface ContextItem {
  id: string;
  text: string;
  source: ContextSourceRef;
  score?: number;
  layer?: ContextLayer;
  citation?: Citation;
  trust?: ContextTrust;
  authorityClass?: AuthorityClass;
  tokensEstimated?: number;
  metadata?: Record<string, unknown>;
}

/** A candidate dropped during packet assembly, with machine-readable reasons. */
export interface PacketExclusion {
  id: string;
  locator: ContextSourceRef;
  score?: number;
  reasons: string[];
}

export interface ContextPacket {
  id: string;
  query: string;
  layers: ContextLayer[];
  /**
   * The packet-level, ranked-and-budgeted entries — note the field name is
   * `items`, not `results`. (`RetrievalResult[]` one layer down, in
   * `retrieval/*.ts`/`rank.ts`, does use a `results`-shaped convention; this
   * is the packaged/packed view built from those results, hence the
   * different name.)
   */
  items: ContextItem[];
  sources: ContextSourceRef[];
  budget: ContextBudget;
  retrievalMode: 'keyword' | 'bm25' | 'semantic' | 'hybrid' | 'manual' | 'none' | string;
  degraded?: boolean;
  degradedReason?: string;
  visibilitySummary?: string;
  createdAt: string;
  diagnostics?: ContextDiagnostics;
  /** Candidates dropped by budget enforcement or policy filtering, with reasons. */
  exclusions?: PacketExclusion[];
}

export interface ContextDiagnostics {
  /** @deprecated Alias for `candidateChunks`, kept for one release. Use `candidateChunks` instead. */
  searchedChunks: number;
  /** Chunks eligible for retrieval after store/policy filtering, before ranking. */
  candidateChunks: number;
  /** Results returned by the retriever (post-topK), before budget enforcement. */
  retrievedResults: number;
  returnedItems: number;
  excludedItems?: number;
  /** Estimated tokens of the packed context, including packing overhead (see `overheadTokens`). */
  estimatedTokens: number;
  estimatedChars: number;
  /** Estimated tokens of packing markup (item headers, separators, fences) counted inside `estimatedTokens`. */
  overheadTokens?: number;
  reasons?: string[];
}

export interface ContextPack {
  packet: ContextPacket;
  text: string;
  /**
   * Citations for the rendered `text`, in reading order. When `PackOptions.groupBy`
   * is set these are renumbered to match the grouped display order; `packet.items`
   * keeps the ranked order and its original citation numbering.
   */
  citations: Citation[];
  sources: ContextSourceRef[];
  tokensEstimated?: number;
  /** Versioned, hashable audit manifest (present unless `PackOptions.includeManifest` is false). */
  manifest?: ContextManifest;
}

export interface ChunkerOptions {
  maxWords?: number;
  overlapWords?: number;
  layer?: ContextLayer;
}

export interface Chunker {
  chunk(source: ContextSource, options?: ChunkerOptions): ContextChunk[];
}

export interface StoreSnapshot {
  sources: ContextSource[];
  chunks: ContextChunk[];
  memories: MemoryRecord[];
}

export interface ChunkFilter {
  sourceId?: string;
  memoryId?: string;
}

export interface ContextStore {
  addSource(source: ContextSource): Promise<void> | void;
  addChunks(chunks: ContextChunk[]): Promise<void> | void;
  addMemory(record: MemoryRecord): Promise<void> | void;
  listSources(): Promise<ContextSource[]> | ContextSource[];
  listChunks(query?: RetrievalQuery): Promise<ContextChunk[]> | ContextChunk[];
  listMemories(query?: RetrievalQuery): Promise<MemoryRecord[]> | MemoryRecord[];
  getMemory(memoryId: string): Promise<MemoryRecord | undefined> | MemoryRecord | undefined;
  /** Removes the source record and all chunks derived from it. */
  removeSource(sourceId: string): Promise<void> | void;
  /** Removes chunks matching the filter; returns the number removed. */
  removeChunks(filter: ChunkFilter): Promise<number> | number;
  /** Removes the memory record and all chunks derived from it. */
  removeMemory(memoryId: string): Promise<void> | void;
  export(): Promise<StoreSnapshot> | StoreSnapshot;
  import(snapshot: StoreSnapshot): Promise<void> | void;
  clear(): Promise<void> | void;
}

export interface Retriever {
  mode: RetrievalResult['retrievalMode'];
  retrieve(query: RetrievalQuery, chunks: ContextChunk[]): Promise<RetrievalResult[]> | RetrievalResult[];
}

export interface RankOptions {
  diversityPenalty?: number;
  /**
   * Fixed reference time (ISO) for the recency component of memory boosts;
   * defaults to the current time. Supply for deterministic ranking.
   */
  now?: string;
  /** Enables a deterministic maximal-marginal-relevance reorder after scoring. */
  mmr?: { lambda?: number };
}

export interface PackOptions {
  format?: 'markdown' | 'plain';
  includeCitations?: boolean;
  includeScores?: boolean;
  includeTrust?: boolean;
  trustBoundary?: 'none' | 'untrusted-source-data';
  /**
   * Per-pack random value to append to the untrusted-source-data fence
   * delimiters. Apps should supply a fresh nonce per call; the library stays
   * deterministic and does not generate randomness itself.
   */
  trustBoundaryNonce?: string;
  /**
   * Opt-in, best-effort secret redaction applied to each item's text before
   * assembly. `true` uses the built-in `redactText`; a function lets apps
   * supply their own redactor. Off by default.
   */
  redact?: boolean | ((text: string) => string);
  heading?: string;
  /**
   * Groups rendered items by source or layer instead of one ranked pile
   * (lost-in-the-middle mitigation). Only the display order changes;
   * `packet.items` keeps ranked order. `ContextPack.citations` is renumbered
   * to match reading order.
   */
  groupBy?: 'source' | 'layer';
  /** Attach a `ContextManifest` to the pack (default true). */
  includeManifest?: boolean;
}

export interface RetrieveAndPackOptions extends RetrievalQuery {
  pack?: PackOptions;
  /** Metadata projection for packet items; overrides the engine-level default. */
  metadataPolicy?: MetadataPolicy;
}
