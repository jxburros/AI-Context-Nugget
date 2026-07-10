import { metadataMatches, nowIso } from '../util.js';
export function recordIsActive(record) {
    if ((record.status ?? 'active') !== 'active')
        return false;
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now())
        return false;
    return true;
}
function chunkMatchesQuery(chunk, query) {
    if (!query)
        return true;
    if (query.layers?.length && (!chunk.layer || !query.layers.includes(chunk.layer)))
        return false;
    if (query.scope && chunk.metadata?.scope !== query.scope)
        return false;
    return metadataMatches(chunk.metadata, query.filters);
}
function memoryMatchesQuery(record, query) {
    if (!query)
        return recordIsActive(record);
    if (!recordIsActive(record))
        return false;
    if (query.layers?.length && !query.layers.includes(record.layer))
        return false;
    if (query.scope && record.scope !== query.scope)
        return false;
    return metadataMatches(record.metadata, query.filters);
}
export class InMemoryContextStore {
    sources = new Map();
    chunks = new Map();
    memories = new Map();
    addSource(source) {
        this.sources.set(source.id, { ...source, updatedAt: source.updatedAt ?? nowIso() });
    }
    addChunks(chunks) {
        for (const chunk of chunks)
            this.chunks.set(chunk.id, chunk);
    }
    addMemory(record) {
        this.memories.set(record.id, { ...record, status: record.status ?? 'active' });
    }
    listSources() {
        return [...this.sources.values()];
    }
    listChunks(query) {
        const sourceVisibility = new Map([...this.sources.values()].map((s) => [s.id, s.metadata?.hideFromAI !== true]));
        return [...this.chunks.values()].filter((chunk) => {
            if (sourceVisibility.get(chunk.source.sourceId) === false)
                return false;
            const memoryId = chunk.metadata?.memoryId;
            if (typeof memoryId === 'string') {
                const record = this.memories.get(memoryId);
                if (!record || !recordIsActive(record))
                    return false;
            }
            return chunkMatchesQuery(chunk, query);
        });
    }
    listMemories(query) {
        return [...this.memories.values()].filter((record) => memoryMatchesQuery(record, query));
    }
    getMemory(memoryId) {
        return this.memories.get(memoryId);
    }
    removeSource(sourceId) {
        this.sources.delete(sourceId);
        this.removeChunks({ sourceId });
    }
    removeChunks(filter) {
        let removed = 0;
        for (const [id, chunk] of this.chunks) {
            const matchesSource = filter.sourceId !== undefined && chunk.source.sourceId === filter.sourceId;
            const matchesMemory = filter.memoryId !== undefined && chunk.metadata?.memoryId === filter.memoryId;
            if (matchesSource || matchesMemory) {
                this.chunks.delete(id);
                removed += 1;
            }
        }
        return removed;
    }
    removeMemory(memoryId) {
        this.memories.delete(memoryId);
        this.removeChunks({ memoryId });
    }
    export() {
        return {
            sources: this.listSources(),
            chunks: [...this.chunks.values()],
            memories: [...this.memories.values()],
        };
    }
    import(snapshot) {
        this.clear();
        for (const source of snapshot.sources)
            this.sources.set(source.id, { ...source, updatedAt: source.updatedAt ?? nowIso() });
        for (const chunk of snapshot.chunks)
            this.chunks.set(chunk.id, chunk);
        for (const memory of snapshot.memories)
            this.memories.set(memory.id, { ...memory, status: memory.status ?? 'active' });
    }
    clear() {
        this.sources.clear();
        this.chunks.clear();
        this.memories.clear();
    }
}
export function jsonStoreSnapshot(store) {
    return store.export();
}
export function snapshotToJson(snapshot) {
    return JSON.stringify(snapshot, null, 2);
}
export function snapshotFromJson(json) {
    const parsed = JSON.parse(json);
    return {
        sources: parsed.sources ?? [],
        chunks: parsed.chunks ?? [],
        memories: parsed.memories ?? [],
    };
}
//# sourceMappingURL=memoryStore.js.map