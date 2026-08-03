import { estimateTokens } from './util.js';
/**
 * Greedy budget admission in ranked order. An item that does not fit is
 * skipped (with reasons recorded) and later, smaller items may still be
 * admitted — the pass does not stop at the first miss.
 */
export function applyContextBudget(results, budget = {}, options = {}) {
    const maxItems = budget.maxItems ?? results.length;
    const maxChars = budget.maxChars ?? Number.POSITIVE_INFINITY;
    // reserveTokens is response headroom: it is deducted from maxTokens before
    // any packing so the model keeps room to answer.
    const maxTokens = Math.max(0, (budget.maxTokens ?? Number.POSITIVE_INFINITY) - (budget.reserveTokens ?? 0));
    const maxItemsPerSource = budget.maxItemsPerSource ?? Number.POSITIVE_INFINITY;
    const perItemOverhead = options.overheadTokensPerItem ?? 0;
    const overheadOf = typeof perItemOverhead === 'function' ? perItemOverhead : () => perItemOverhead;
    const reasons = [];
    const noTokenBudget = budget.maxTokens !== undefined && (budget.reserveTokens ?? 0) >= budget.maxTokens;
    if (noTokenBudget) {
        reasons.push(`reserveTokens (${budget.reserveTokens}) >= maxTokens (${budget.maxTokens}): no token budget remains`);
    }
    const perSource = new Map();
    const included = [];
    const excluded = [];
    const exclusions = [];
    let chars = 0;
    let contentTokensEstimated = 0;
    let overheadTokens = options.overheadTokensFixed ?? 0;
    let tokensEstimated = overheadTokens;
    for (const result of results) {
        const sourceId = result.chunk.source.sourceId;
        const sourceCount = perSource.get(sourceId) ?? 0;
        const contentTokens = result.chunk.tokensEstimated ?? estimateTokens(result.chunk.text);
        const itemOverhead = overheadOf(result);
        const nextChars = chars + result.chunk.text.length;
        const nextTokens = tokensEstimated + contentTokens + itemOverhead;
        const failed = [];
        if (included.length >= maxItems)
            failed.push('max-items');
        if (sourceCount >= maxItemsPerSource)
            failed.push('per-source-cap');
        if (nextChars > maxChars)
            failed.push('max-chars');
        if (nextTokens > maxTokens)
            failed.push(noTokenBudget ? 'no-token-budget' : 'max-tokens');
        if (failed.length > 0) {
            excluded.push(result);
            exclusions.push({ result, reasons: failed });
            continue;
        }
        included.push(result);
        perSource.set(sourceId, sourceCount + 1);
        chars = nextChars;
        contentTokensEstimated += contentTokens;
        overheadTokens += itemOverhead;
        tokensEstimated = nextTokens;
    }
    return { included, excluded, exclusions, tokensEstimated, contentTokensEstimated, overheadTokens, chars, reasons };
}
//# sourceMappingURL=budget.js.map