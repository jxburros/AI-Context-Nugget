import type { Chunker, ChunkerOptions } from './types.js';
export interface TextChunkerOptions extends ChunkerOptions {
    preserveParagraphs?: boolean;
}
export declare function textChunker(defaults?: TextChunkerOptions): Chunker;
export declare function markdownChunker(defaults?: TextChunkerOptions): Chunker;
