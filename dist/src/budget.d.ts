import type { ContextBudget, RetrievalResult } from './types.js';
export type BudgetExclusionReason = 'max-items' | 'per-source-cap' | 'max-chars' | 'max-tokens' | 'no-token-budget';
export interface BudgetExclusion {
    result: RetrievalResult;
    /** Every constraint the item failed, not just the first. */
    reasons: BudgetExclusionReason[];
}
export interface BudgetOptions {
    /**
     * Tokens charged per included item for packing markup (item headers,
     * citation labels, separators), in addition to the item's content tokens.
     * A function receives the candidate and returns its overhead. Default 0.
     */
    overheadTokensPerItem?: number | ((result: RetrievalResult) => number);
    /** One-time tokens charged up front for pack-level framing (heading, trust fence). Default 0. */
    overheadTokensFixed?: number;
}
export interface BudgetReport {
    included: RetrievalResult[];
    excluded: RetrievalResult[];
    /** The excluded results again, with machine-readable reasons per item. */
    exclusions: BudgetExclusion[];
    /** Content + packing-overhead tokens for everything included. */
    tokensEstimated: number;
    /** Raw chunk-text tokens only, without packing overhead. */
    contentTokensEstimated: number;
    /** Packing-overhead tokens counted inside `tokensEstimated`. */
    overheadTokens: number;
    chars: number;
    /** Report-level notes, e.g. when `reserveTokens` consumes the whole token budget. */
    reasons: string[];
}
/**
 * Greedy budget admission in ranked order. An item that does not fit is
 * skipped (with reasons recorded) and later, smaller items may still be
 * admitted — the pass does not stop at the first miss.
 */
export declare function applyContextBudget(results: RetrievalResult[], budget?: ContextBudget, options?: BudgetOptions): BudgetReport;
