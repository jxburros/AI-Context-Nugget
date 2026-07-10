import type { ContextChunk, RetrievalQuery, RetrievalResult, Retriever } from '../types.js';
export interface HybridRetrieverOptions {
    /** Sub-retrievers to fuse. Defaults to [bm25Retriever(), keywordRetriever()]. */
    retrievers?: Retriever[];
    /** Reciprocal-rank-fusion constant; higher values flatten the influence of top ranks. */
    k?: number;
}
/**
 * Fuses sub-retrievers by reciprocal rank (RRF), not raw score addition. Raw
 * BM25 scores (unbounded, typically 1-15) and keyword scores (normalized to
 * ~0-1.5) live on incompatible scales, so summing them made the smaller
 * signal irrelevant. RRF only looks at each sub-retriever's rank ordering,
 * so every retriever contributes on equal footing regardless of its score scale.
 */
export declare class HybridRetriever implements Retriever {
    readonly mode: "hybrid";
    private readonly subRetrievers;
    private readonly k;
    constructor(options?: HybridRetrieverOptions);
    retrieve(query: RetrievalQuery, chunks: ContextChunk[]): Promise<RetrievalResult[]>;
}
export declare function hybridRetriever(options?: HybridRetrieverOptions): HybridRetriever;
