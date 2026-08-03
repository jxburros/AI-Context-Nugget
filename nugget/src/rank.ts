import type { RankOptions, RetrievalResult } from './types.js';
import { clamp01, recencyBoost } from './util.js';
import { uniqueTokens } from './tokenize.js';

const byScoreThenId = (a: RetrievalResult, b: RetrievalResult): number =>
  b.score - a.score || a.chunk.id.localeCompare(b.chunk.id);

/**
 * Penalizes repeated chunks from the same source so a single source cannot
 * crowd out the rest. Input is sorted first, so the best chunk per source
 * always takes the zero-penalty slot and the output does not depend on the
 * caller's argument order.
 */
export function applySourceDiversity(results: RetrievalResult[], options: RankOptions = {}): RetrievalResult[] {
  const diversityPenalty = options.diversityPenalty ?? 0.12;
  const sourceCounts = new Map<string, number>();
  return [...results]
    .sort(byScoreThenId)
    .map((result) => {
      const sourceId = result.chunk.source.sourceId;
      const count = sourceCounts.get(sourceId) ?? 0;
      sourceCounts.set(sourceId, count + 1);
      const adjustedScore = result.score / (1 + diversityPenalty * count);
      return {
        ...result,
        score: adjustedScore,
        scoreBreakdown: { ...result.scoreBreakdown, diversityAdjusted: adjustedScore },
      };
    })
    .sort(byScoreThenId);
}

/**
 * Boosts memory-backed chunks by importance/confidence/recency. The boost is
 * multiplicative (`score * (1 + boost)`, boost clamped to [0, 1]) so it is
 * scale-invariant across retrievers — RRF scores (~0.016), keyword scores
 * (0–1.5), and unbounded BM25 scores all keep their relative order against
 * documents instead of a flat additive boost letting any memory outrank them.
 */
export function applyMemorySignals(results: RetrievalResult[], options: RankOptions = {}): RetrievalResult[] {
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  return results
    .map((result) => {
      if (typeof result.chunk.metadata?.memoryId !== 'string') return result;
      const importance = typeof result.chunk.metadata?.importance === 'number' ? result.chunk.metadata.importance : 0;
      const confidence = typeof result.chunk.metadata?.confidence === 'number' ? result.chunk.metadata.confidence : 0;
      const recent = recencyBoost(result.chunk.updatedAt ?? result.chunk.createdAt, 30, nowMs);
      const boost = clamp01(0.2 * importance + 0.1 * confidence + 0.05 * recent);
      const adjustedScore = result.score * (1 + boost);
      return {
        ...result,
        score: adjustedScore,
        scoreBreakdown: {
          ...result.scoreBreakdown,
          preBoostScore: result.score,
          memoryBoostFactor: 1 + boost,
          memoryAdjusted: adjustedScore,
        },
        reasons: boost > 0 ? [...(result.reasons ?? []), 'memory importance/confidence/recency boost'] : result.reasons,
      };
    })
    .sort(byScoreThenId);
}

/**
 * Deterministic maximal-marginal-relevance reorder: greedily picks the result
 * maximizing `lambda * normalizedScore - (1 - lambda) * maxSimilarityToSelected`,
 * where similarity is Jaccard overlap of unique tokens. Scores are left
 * untouched (budget math is unaffected); only the order changes.
 */
export function applyMmr(results: RetrievalResult[], options: { lambda?: number } = {}): RetrievalResult[] {
  if (results.length <= 1) return [...results];
  const lambda = options.lambda ?? 0.7;
  const maxScore = results.reduce((max, r) => Math.max(max, r.score), 0);
  const tokenSets = new Map<string, Set<string>>(
    results.map((r) => [r.chunk.id, new Set(uniqueTokens(r.chunk.text))]),
  );
  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
  };

  const remaining = [...results].sort(byScoreThenId);
  const selected: RetrievalResult[] = [];
  const selectedSets: Set<string>[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      const norm = maxScore > 0 ? candidate.score / maxScore : 0;
      const candidateSet = tokenSets.get(candidate.chunk.id) ?? new Set<string>();
      let maxSim = 0;
      for (const set of selectedSets) maxSim = Math.max(maxSim, jaccard(candidateSet, set));
      const value = lambda * norm - (1 - lambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    selectedSets.push(tokenSets.get(chosen.chunk.id) ?? new Set<string>());
    selected.push({ ...chosen, scoreBreakdown: { ...chosen.scoreBreakdown, mmr: bestValue } });
  }
  return selected;
}

export function rankResults(results: RetrievalResult[], options: RankOptions = {}): RetrievalResult[] {
  const ranked = applySourceDiversity(applyMemorySignals(results, options), options);
  return options.mmr ? applyMmr(ranked, options.mmr) : ranked;
}
