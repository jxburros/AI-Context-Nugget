import type { RankOptions, RetrievalResult } from './types.js';
export declare function applySourceDiversity(results: RetrievalResult[], options?: RankOptions): RetrievalResult[];
export declare function applyMemorySignals(results: RetrievalResult[]): RetrievalResult[];
export declare function rankResults(results: RetrievalResult[], options?: RankOptions): RetrievalResult[];
