import type { ContextChunk, RetrievalQuery, RetrievalResult, Retriever } from '../types.js';
/**
 * Adapter contract for embedding providers. Context Nugget ships the cosine-
 * similarity retriever below but no concrete embedder — providers (OpenAI,
 * local models, etc.) live in optional adapter packages so the core stays
 * dependency-free.
 */
export interface Embedder {
    embed(texts: string[]): Promise<number[][]>;
    dimensions?: number;
}
export declare class SemanticRetriever implements Retriever {
    private readonly embedder;
    readonly mode: "semantic";
    constructor(embedder: Embedder);
    retrieve(query: RetrievalQuery, chunks: ContextChunk[]): Promise<RetrievalResult[]>;
}
export declare function semanticRetriever(embedder: Embedder): SemanticRetriever;
