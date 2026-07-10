import type { ContextChunk, RetrievalQuery, RetrievalResult, Retriever } from '../types.js';
export interface BM25IndexOptions {
    k1?: number;
    b?: number;
}
export interface BM25TermContribution {
    term: string;
    score: number;
}
export interface BM25Hit {
    id: string;
    score: number;
    termContributions: BM25TermContribution[];
}
export declare class BM25Index {
    private readonly k1;
    private readonly b;
    private readonly chunks;
    private readonly chunksById;
    private readonly tf;
    private readonly df;
    private readonly docLens;
    private readonly avgDocLen;
    constructor(chunks: ContextChunk[], options?: BM25IndexOptions);
    query(query: string, topK?: number, minScore?: number): BM25Hit[];
    getChunk(id: string): ContextChunk | undefined;
}
export declare class BM25Retriever implements Retriever {
    private readonly options;
    readonly mode: "bm25";
    constructor(options?: BM25IndexOptions);
    retrieve(query: RetrievalQuery, chunks: ContextChunk[]): RetrievalResult[];
}
export declare function bm25Retriever(options?: BM25IndexOptions): BM25Retriever;
