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

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SemanticRetriever implements Retriever {
  readonly mode = 'semantic' as const;

  constructor(private readonly embedder: Embedder) {}

  async retrieve(query: RetrievalQuery, chunks: ContextChunk[]): Promise<RetrievalResult[]> {
    if (chunks.length === 0) return [];
    const [queryEmbedding, ...chunkEmbeddings] = await this.embedder.embed([query.query, ...chunks.map((chunk) => chunk.text)]);
    if (!queryEmbedding) return [];

    return chunks
      .map((chunk, i): RetrievalResult => {
        const embedding = chunkEmbeddings[i];
        const score = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
        return {
          chunk,
          score,
          scoreBreakdown: { semantic: score },
          reasons: ['semantic similarity'],
          layer: chunk.layer,
          retrievalMode: this.mode,
        };
      })
      .filter((result) => result.score > (query.minScore ?? 0))
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, query.topK ?? 8);
  }
}

export function semanticRetriever(embedder: Embedder): SemanticRetriever {
  return new SemanticRetriever(embedder);
}
