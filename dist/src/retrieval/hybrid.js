import { bm25Retriever } from './bm25.js';
import { keywordRetriever } from './keyword.js';
const DEFAULT_RRF_K = 60;
/**
 * Fuses sub-retrievers by reciprocal rank (RRF), not raw score addition. Raw
 * BM25 scores (unbounded, typically 1-15) and keyword scores (normalized to
 * ~0-1.5) live on incompatible scales, so summing them made the smaller
 * signal irrelevant. RRF only looks at each sub-retriever's rank ordering,
 * so every retriever contributes on equal footing regardless of its score scale.
 */
export class HybridRetriever {
    mode = 'hybrid';
    subRetrievers;
    k;
    constructor(options = {}) {
        this.subRetrievers = options.retrievers ?? [bm25Retriever(), keywordRetriever()];
        this.k = options.k ?? DEFAULT_RRF_K;
    }
    async retrieve(query, chunks) {
        const wideTopK = Math.max(query.topK ?? 8, 20);
        const perRetriever = await Promise.all(this.subRetrievers.map((retriever) => retriever.retrieve({ ...query, topK: wideTopK, minScore: 0 }, chunks)));
        const fused = new Map();
        perRetriever.forEach((results, retrieverIndex) => {
            const retrieverMode = this.subRetrievers[retrieverIndex]?.mode ?? `retriever${retrieverIndex}`;
            results.forEach((result, rank) => {
                const contribution = 1 / (this.k + rank + 1);
                const entry = fused.get(result.chunk.id) ?? {
                    chunk: result.chunk,
                    rrf: 0,
                    scoreBreakdown: {},
                    reasons: [],
                };
                entry.rrf += contribution;
                entry.scoreBreakdown[`${retrieverMode}Rank`] = rank + 1;
                entry.scoreBreakdown[retrieverMode] = result.score;
                if (result.reasons?.length)
                    entry.reasons.push(...result.reasons);
                fused.set(result.chunk.id, entry);
            });
        });
        return [...fused.values()]
            .map((entry) => ({
            chunk: entry.chunk,
            score: entry.rrf,
            scoreBreakdown: { ...entry.scoreBreakdown, rrf: entry.rrf },
            reasons: entry.reasons,
            layer: entry.chunk.layer,
            retrievalMode: this.mode,
        }))
            .filter((result) => result.score > (query.minScore ?? 0))
            .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
            .slice(0, query.topK ?? 8);
    }
}
export function hybridRetriever(options = {}) {
    return new HybridRetriever(options);
}
//# sourceMappingURL=hybrid.js.map