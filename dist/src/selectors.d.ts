import type { ContextBudget, ContextSource, RetrievalQuery } from './types.js';
export interface SourceSelectionResult {
    source: ContextSource;
    score: number;
    reasons: string[];
}
export interface PolicyDrivenSourceRule {
    taskType: string;
    requiredSourceIds?: string[];
    optionalSourceIds?: string[];
    requiredKinds?: string[];
    optionalKinds?: string[];
}
export declare function selectSourcesByPolicy(sources: ContextSource[], taskType: string, rules: PolicyDrivenSourceRule[]): {
    selected: ContextSource[];
    missingRequired: string[];
    coverageWarning?: string;
};
export declare function rankSourcesByQuery(sources: ContextSource[], query: RetrievalQuery, budget?: ContextBudget): SourceSelectionResult[];
