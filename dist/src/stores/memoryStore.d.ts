import type { ChunkFilter, ContextChunk, ContextSource, ContextStore, MemoryRecord, RetrievalQuery, StoreSnapshot } from '../types.js';
/**
 * True when the record is retrievable at the reference time: status is
 * `'active'` and the reference instant falls inside its `expiresAt` /
 * `validFrom` / `validTo` windows. `options.asOf` (ISO) sets the reference
 * time for bitemporal queries; it defaults to now.
 */
export declare function recordIsActive(record: MemoryRecord, options?: {
    asOf?: string;
}): boolean;
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
/** @deprecated Pass-through for `store.export()`; call that directly instead. */
export declare function jsonStoreSnapshot(store: ContextStore): StoreSnapshot | Promise<StoreSnapshot>;
export declare function snapshotToJson(snapshot: StoreSnapshot): string;
export declare function snapshotFromJson(json: string): StoreSnapshot;
