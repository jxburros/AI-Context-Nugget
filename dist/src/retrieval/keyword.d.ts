import type { ContextChunk, RetrievalQuery, RetrievalResult, Retriever } from '../types.js';
export declare class KeywordRetriever implements Retriever {
    readonly mode: "keyword";
    retrieve(query: RetrievalQuery, chunks: ContextChunk[]): RetrievalResult[];
}
export declare function keywordRetriever(): KeywordRetriever;
