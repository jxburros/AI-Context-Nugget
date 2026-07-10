import type { ChunkFilter, ContextChunk, ContextSource, ContextStore, MemoryRecord, RetrievalQuery, StoreSnapshot } from '../types.js';
export declare function recordIsActive(record: MemoryRecord): boolean;
export declare class InMemoryContextStore implements ContextStore {
    private readonly sources;
    private readonly chunks;
    private readonly memories;
    addSource(source: ContextSource): void;
    addChunks(chunks: ContextChunk[]): void;
    addMemory(record: MemoryRecord): void;
    listSources(): ContextSource[];
    listChunks(query?: RetrievalQuery): ContextChunk[];
    listMemories(query?: RetrievalQuery): MemoryRecord[];
    getMemory(memoryId: string): MemoryRecord | undefined;
    removeSource(sourceId: string): void;
    removeChunks(filter: ChunkFilter): number;
    removeMemory(memoryId: string): void;
    export(): StoreSnapshot;
    import(snapshot: StoreSnapshot): void;
    clear(): void;
}
export declare function jsonStoreSnapshot(store: ContextStore): StoreSnapshot | Promise<StoreSnapshot>;
export declare function snapshotToJson(snapshot: StoreSnapshot): string;
export declare function snapshotFromJson(json: string): StoreSnapshot;
