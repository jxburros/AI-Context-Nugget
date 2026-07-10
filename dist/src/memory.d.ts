import type { ContextChunk, MemoryCandidate, MemoryDecision, MemoryPolicy, MemoryRecord } from './types.js';
export declare const manualMemoryPolicy: MemoryPolicy;
export declare function memoryRecordFromCandidate(candidate: MemoryCandidate, decision?: MemoryDecision): MemoryRecord;
export declare function memoryToChunk(record: MemoryRecord): ContextChunk;
/**
 * Mode x hook contract:
 * - `manual`: never stores; `shouldStore` is not consulted.
 * - `suggested`: never stores directly. If `shouldStore` approves, the decision comes
 *   back as `{ store: false, suggested: true }` so the app can route it to an approval
 *   UI and call `addMemory` itself once approved.
 * - `auto`: `shouldStore` decides; defaults to storing when no hook is configured.
 */
export declare function shouldStoreMemory(policy: MemoryPolicy, candidate: MemoryCandidate): Promise<MemoryDecision>;
