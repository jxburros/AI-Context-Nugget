import type { ContextBudget, RetrievalResult } from './types.js';
export interface BudgetReport {
    included: RetrievalResult[];
    excluded: RetrievalResult[];
    tokensEstimated: number;
    chars: number;
}
export declare function applyContextBudget(results: RetrievalResult[], budget?: ContextBudget): BudgetReport;
