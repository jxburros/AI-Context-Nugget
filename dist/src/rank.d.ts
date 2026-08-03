import type { RankOptions, RetrievalResult } from './types.js';
/**
 * Penalizes repeated chunks from the same source so a single source cannot
 * crowd out the rest. Input is sorted first, so the best chunk per source
 * always takes the zero-penalty slot and the output does not depend on the
 * caller's argument order.
 */
export declare function applySourceDiversity(results: RetrievalResult[], options?: RankOptions): RetrievalResult[];
/**
 * Boosts memory-backed chunks by importance/confidence/recency. The boost is
 * multiplicative (`score * (1 + boost)`, boost clamped to [0, 1]) so it is
 * scale-invariant across retrievers — RRF scores (~0.016), keyword scores
 * (0–1.5), and unbounded BM25 scores all keep their relative order against
 * documents instead of a flat additive boost letting any memory outrank them.
 */
export declare function applyMemorySignals(results: RetrievalResult[], options?: RankOptions): RetrievalResult[];
/**
 * Deterministic maximal-marginal-relevance reorder: greedily picks the result
 * maximizing `lambda * normalizedScore - (1 - lambda) * maxSimilarityToSelected`,
 * where similarity is Jaccard overlap of unique tokens. Scores are left
 * untouched (budget math is unaffected); only the order changes.
 */
export declare function applyMmr(results: RetrievalResult[], options?: {
    lambda?: number;
}): RetrievalResult[];
export declare function rankResults(results: RetrievalResult[], options?: RankOptions): RetrievalResult[];
