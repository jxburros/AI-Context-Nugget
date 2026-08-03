import type { ContextBudget, RetrievalResult } from './types.js';
import { estimateTokens } from './util.js';

export type BudgetExclusionReason =
  | 'max-items'
  | 'per-source-cap'
  | 'max-chars'
  | 'max-tokens'
  | 'no-token-budget';

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
export function applyContextBudget(
  results: RetrievalResult[],
  budget: ContextBudget = {},
  options: BudgetOptions = {},
): BudgetReport {
  const maxItems = budget.maxItems ?? results.length;
  const maxChars = budget.maxChars ?? Number.POSITIVE_INFINITY;
  // reserveTokens is response headroom: it is deducted from maxTokens before
  // any packing so the model keeps room to answer.
  const maxTokens = Math.max(0, (budget.maxTokens ?? Number.POSITIVE_INFINITY) - (budget.reserveTokens ?? 0));
  const maxItemsPerSource = budget.maxItemsPerSource ?? Number.POSITIVE_INFINITY;
  const perItemOverhead = options.overheadTokensPerItem ?? 0;
  const overheadOf = typeof perItemOverhead === 'function' ? perItemOverhead : () => perItemOverhead;
  const reasons: string[] = [];
  const noTokenBudget = budget.maxTokens !== undefined && (budget.reserveTokens ?? 0) >= budget.maxTokens;
  if (noTokenBudget) {
    reasons.push(`reserveTokens (${budget.reserveTokens}) >= maxTokens (${budget.maxTokens}): no token budget remains`);
  }

  const perSource = new Map<string, number>();
  const included: RetrievalResult[] = [];
  const excluded: RetrievalResult[] = [];
  const exclusions: BudgetExclusion[] = [];
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
    const failed: BudgetExclusionReason[] = [];
    if (included.length >= maxItems) failed.push('max-items');
    if (sourceCount >= maxItemsPerSource) failed.push('per-source-cap');
    if (nextChars > maxChars) failed.push('max-chars');
    if (nextTokens > maxTokens) failed.push(noTokenBudget ? 'no-token-budget' : 'max-tokens');
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
