export type ContextTrust = 'trusted' | 'untrusted' | 'app' | 'user' | 'system';

export interface ContextSource {
  id: string;
  kind: 'text' | 'markdown' | 'json' | 'file' | 'url' | 'memory' | 'app_state' | string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  trust?: ContextTrust;
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
  metadata?: Record<string, unknown>;
  tokensEstimated?: number;
  createdAt?: string;
  updatedAt?: string;
}

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
  status?: 'active' | 'archived' | 'superseded';
  supersedes?: string[];
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
  tokensEstimated?: number;
  metadata?: Record<string, unknown>;
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
  estimatedTokens: number;
  estimatedChars: number;
  reasons?: string[];
}

export interface ContextPack {
  packet: ContextPacket;
  text: string;
  citations: Citation[];
  sources: ContextSourceRef[];
  tokensEstimated?: number;
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
}

export interface RetrieveAndPackOptions extends RetrievalQuery {
  pack?: PackOptions;
}
