import type { Citation, ContextItem, ContextSourceRef } from './types.js';
export declare function formatSourceLabel(source: ContextSourceRef): string;
export declare function createCitation(source: ContextSourceRef, index: number): Citation;
export declare function citationKey(source: ContextSourceRef): string;
export declare function attachCitations(items: Omit<ContextItem, 'citation'>[]): ContextItem[];
