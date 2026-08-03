import type { AuthorityClass, ContextBudget, ContextDiagnostics, ContextLayer, ContextPack, ContextPacket, ContextSourceRef, ContextTrust } from './types.js';
export declare const MANIFEST_VERSION = 1;
export interface ManifestItem {
    /** Chunk id of the included item. */
    id: string;
    /** Citation id in packet (ranked) order, e.g. `'c1'`. */
    citationId?: string;
    locator: ContextSourceRef;
    layer?: ContextLayer;
    trust?: ContextTrust;
    authorityClass?: AuthorityClass;
    score?: number;
    scoreBreakdown?: Record<string, number>;
    selectionReasons: string[];
    tokensEstimated: number;
    /** `stableHash` of the item's text — pins the manifest to exact content. */
    contentHash: string;
}
export interface ManifestExcludedCandidate {
    id: string;
    locator: ContextSourceRef;
    score?: number;
    /** Machine-readable reasons, e.g. `'max-tokens'`, `'per-source-cap'`, `'policy-filtered'`. */
    reasons: string[];
}
/**
 * Versioned, serializable audit record of what a context packet contains and
 * why: every included item with its locator, trust/authority classification,
 * scores, and content hash; every excluded candidate with machine-readable
 * reasons; and the budget actually spent (including packing overhead).
 *
 * `packageHash` is deterministic: it covers the selection — query, layers,
 * retrieval mode, requested budget, and each item's identity/order/content
 * hash — and deliberately excludes `createdAt`, `packetId`, scores, and
 * diagnostics (all time- or run-dependent). Two runs that select the same
 * content in the same order under the same rules produce the same hash.
 */
export interface ContextManifest {
    manifestVersion: typeof MANIFEST_VERSION;
    packetId: string;
    query: string;
    layers: ContextLayer[];
    retrievalMode: string;
    degraded?: boolean;
    degradedReason?: string;
    budget: {
        requested: ContextBudget;
        /** Content + packing-overhead tokens actually included. */
        actualTokens: number;
        actualChars: number;
        overheadTokens: number;
        /** Measured token estimate of the rendered pack text, when built from a `ContextPack`. */
        packTokensEstimated?: number;
    };
    items: ManifestItem[];
    excluded: ManifestExcludedCandidate[];
    diagnostics?: ContextDiagnostics;
    /** Not covered by `packageHash`. */
    createdAt: string;
    packageHash: string;
}
/** Deterministic JSON: recursively sorted object keys, `undefined` values dropped. */
export declare function canonicalJson(value: unknown): string;
/** Recomputes the deterministic hash from the manifest's hashed projection. */
export declare function manifestHash(manifest: ContextManifest): string;
/** True when `manifest.packageHash` matches its recomputed hash. */
export declare function verifyManifest(manifest: ContextManifest): boolean;
/**
 * Builds a manifest from a packet (and optionally the rendered pack, for the
 * measured `packTokensEstimated`). `packContext` calls this by default;
 * apps assembling packets manually can call it standalone.
 */
export declare function buildManifest(packet: ContextPacket, pack?: ContextPack): ContextManifest;
