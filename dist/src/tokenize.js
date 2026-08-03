// Not applied by tokenizers or retrievers (BM25's IDF already down-weights common
// terms) — used only by the engine's empty-query diagnostic heuristic.
export const DEFAULT_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
    'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
    'were', 'will', 'with', 'you', 'your', 'we', 'our', 'they', 'their'
]);
// Unicode-aware: matches letters/numbers from any script. Does not filter stopwords.
export function tokenize(text, options = {}) {
    const minLength = options.minLength ?? 1;
    const raw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const stopwords = options.stopwords;
    return raw.filter((token) => token.length >= minLength && !stopwords?.has(token));
}
export function uniqueTokens(text, options = {}) {
    return [...new Set(tokenize(text, options))];
}
//# sourceMappingURL=tokenize.js.map