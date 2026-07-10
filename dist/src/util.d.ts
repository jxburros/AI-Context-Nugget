export declare function stableHash(input: string): string;
export declare function makeId(prefix: string, seed: string): string;
export declare function estimateTokens(text: string): number;
export declare function uniqueBy<T>(items: T[], key: (item: T) => string): T[];
export declare function nowIso(): string;
export declare function metadataMatches(metadata: Record<string, unknown> | undefined, filters?: Record<string, unknown>): boolean;
export declare function clamp01(value: number): number;
export declare function daysSince(iso?: string): number | null;
export declare function recencyBoost(iso?: string, halfLifeDays?: number): number;
