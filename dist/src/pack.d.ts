import type { ContextBudget, ContextLayer, ContextPack, ContextPacket, PacketExclusion, PackOptions, RetrievalResult } from './types.js';
import { type BudgetOptions } from './budget.js';
export type MetadataPolicy = 'all' | 'minimal' | ((metadata: Record<string, unknown>) => Record<string, unknown>);
/** Chunk metadata keys copied into packet items under the default `'minimal'` metadata policy. */
export declare const METADATA_ALLOWLIST: readonly ["chunkIndex", "headingPath", "startWord", "endWord", "memoryId", "scope", "tags", "importance", "confidence", "status"];
/**
 * Default per-item packing overhead charged during budgeting: approximates the
 * rendered item header (`### [1] label`) plus blank-line separators, so
 * `maxTokens` bounds what actually ships, not just raw chunk text.
 */
export declare function defaultItemOverheadTokens(result: RetrievalResult): number;
/**
 * One-time packing overhead for pack-level framing: the heading line plus the
 * untrusted-source-data fence when enabled.
 */
export declare function estimatePackFixedOverheadTokens(options?: PackOptions): number;
export interface PacketOptions {
    query: string;
    layers?: ContextLayer[];
    budget?: ContextBudget;
    retrievalMode?: ContextPacket['retrievalMode'];
    degraded?: boolean;
    degradedReason?: string;
    diagnosticsReasons?: string[];
    /** Chunks eligible for retrieval after store/policy filtering, before ranking. */
    candidateChunks?: number;
    /**
     * Controls how much chunk/source metadata is copied into `ContextItem.metadata`.
     * `'minimal'` (default) copies only a small allowlist of Context-Nugget-owned
     * fields; `'all'` copies everything (including whatever an app attached to
     * source metadata); a function lets apps define a custom projection.
     */
    metadataPolicy?: MetadataPolicy;
    /**
     * Overrides budget-time packing-overhead accounting. Defaults to charging
     * `defaultItemOverheadTokens` per item; pass `{}` to restore raw
     * content-only budgeting.
     */
    budgetOptions?: BudgetOptions;
    /** Candidates already dropped upstream (e.g. by memory policy), recorded in `packet.exclusions`. */
    policyExclusions?: PacketExclusion[];
}
export declare function packetFromResults(results: RetrievalResult[], options: PacketOptions): ContextPacket;
export declare function packContext(packet: ContextPacket, options?: PackOptions): ContextPack;
