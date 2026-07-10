import { estimateTokens } from './util.js';
export function applyContextBudget(results, budget = {}) {
    const maxItems = budget.maxItems ?? results.length;
    const maxChars = budget.maxChars ?? Number.POSITIVE_INFINITY;
    const maxTokens = Math.max(0, (budget.maxTokens ?? Number.POSITIVE_INFINITY) - (budget.reserveTokens ?? 0));
    const maxItemsPerSource = budget.maxItemsPerSource ?? Number.POSITIVE_INFINITY;
    const perSource = new Map();
    const included = [];
    const excluded = [];
    let chars = 0;
    let tokensEstimated = 0;
    for (const result of results) {
        const sourceId = result.chunk.source.sourceId;
        const sourceCount = perSource.get(sourceId) ?? 0;
        const nextChars = chars + result.chunk.text.length;
        const nextTokens = tokensEstimated + (result.chunk.tokensEstimated ?? estimateTokens(result.chunk.text));
        const fits = included.length < maxItems &&
            sourceCount < maxItemsPerSource &&
            nextChars <= maxChars &&
            nextTokens <= maxTokens;
        if (!fits) {
            excluded.push(result);
            continue;
        }
        included.push(result);
        perSource.set(sourceId, sourceCount + 1);
        chars = nextChars;
        tokensEstimated = nextTokens;
    }
    return { included, excluded, chars, tokensEstimated };
}
//# sourceMappingURL=budget.js.map