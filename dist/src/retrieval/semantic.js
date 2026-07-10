function cosineSimilarity(a, b) {
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
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
export class SemanticRetriever {
    embedder;
    mode = 'semantic';
    constructor(embedder) {
        this.embedder = embedder;
    }
    async retrieve(query, chunks) {
        if (chunks.length === 0)
            return [];
        const [queryEmbedding, ...chunkEmbeddings] = await this.embedder.embed([query.query, ...chunks.map((chunk) => chunk.text)]);
        if (!queryEmbedding)
            return [];
        return chunks
            .map((chunk, i) => {
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
export function semanticRetriever(embedder) {
    return new SemanticRetriever(embedder);
}
//# sourceMappingURL=semantic.js.map