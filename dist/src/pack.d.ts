import type { ContextBudget, ContextLayer, ContextPack, ContextPacket, PackOptions, RetrievalResult } from './types.js';
export type MetadataPolicy = 'all' | 'minimal' | ((metadata: Record<string, unknown>) => Record<string, unknown>);
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
}
export declare function packetFromResults(results: RetrievalResult[], options: PacketOptions): ContextPacket;
export declare function packContext(packet: ContextPacket, options?: PackOptions): ContextPack;
