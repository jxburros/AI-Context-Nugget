import type {
  AuthorityClass,
  ContextBudget,
  ContextDiagnostics,
  ContextLayer,
  ContextPack,
  ContextPacket,
  ContextSourceRef,
  ContextTrust,
} from './types.js';
import { estimateTokens, stableHash } from './util.js';

export const MANIFEST_VERSION = 1;

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
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry === undefined ? null : entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

function hashProjection(manifest: ContextManifest): unknown {
  return {
    manifestVersion: manifest.manifestVersion,
    query: manifest.query,
    layers: manifest.layers,
    retrievalMode: manifest.retrievalMode,
    degraded: manifest.degraded ?? false,
    degradedReason: manifest.degradedReason,
    budgetRequested: manifest.budget.requested,
    items: manifest.items.map((item) => ({
      id: item.id,
      citationId: item.citationId,
      locator: item.locator,
      layer: item.layer,
      trust: item.trust,
      authorityClass: item.authorityClass,
      tokensEstimated: item.tokensEstimated,
      contentHash: item.contentHash,
    })),
    excluded: manifest.excluded.map((candidate) => ({ id: candidate.id, reasons: candidate.reasons })),
  };
}

/** Recomputes the deterministic hash from the manifest's hashed projection. */
export function manifestHash(manifest: ContextManifest): string {
  return stableHash(canonicalJson(hashProjection(manifest)));
}

/** True when `manifest.packageHash` matches its recomputed hash. */
export function verifyManifest(manifest: ContextManifest): boolean {
  return manifest.packageHash === manifestHash(manifest);
}

/**
 * Builds a manifest from a packet (and optionally the rendered pack, for the
 * measured `packTokensEstimated`). `packContext` calls this by default;
 * apps assembling packets manually can call it standalone.
 */
export function buildManifest(packet: ContextPacket, pack?: ContextPack): ContextManifest {
  const items: ManifestItem[] = packet.items.map((item) => {
    const scoreBreakdown = item.metadata?.scoreBreakdown;
    const reasons = item.metadata?.reasons;
    return {
      id: item.id,
      citationId: item.citation?.id,
      locator: item.source,
      layer: item.layer,
      trust: item.trust,
      authorityClass: item.authorityClass,
      score: item.score,
      scoreBreakdown: scoreBreakdown && typeof scoreBreakdown === 'object' ? (scoreBreakdown as Record<string, number>) : undefined,
      selectionReasons: Array.isArray(reasons) ? (reasons as string[]) : [],
      tokensEstimated: item.tokensEstimated ?? estimateTokens(item.text),
      contentHash: stableHash(item.text),
    };
  });
  const excluded: ManifestExcludedCandidate[] = (packet.exclusions ?? []).map((exclusion) => ({
    id: exclusion.id,
    locator: exclusion.locator,
    score: exclusion.score,
    reasons: exclusion.reasons,
  }));
  const diagnostics = packet.diagnostics;
  const manifest: ContextManifest = {
    manifestVersion: MANIFEST_VERSION,
    packetId: packet.id,
    query: packet.query,
    layers: packet.layers,
    retrievalMode: packet.retrievalMode,
    degraded: packet.degraded,
    degradedReason: packet.degradedReason,
    budget: {
      requested: packet.budget,
      actualTokens: diagnostics?.estimatedTokens ?? items.reduce((sum, item) => sum + item.tokensEstimated, 0),
      actualChars: diagnostics?.estimatedChars ?? packet.items.reduce((sum, item) => sum + item.text.length, 0),
      overheadTokens: diagnostics?.overheadTokens ?? 0,
      packTokensEstimated: pack?.tokensEstimated,
    },
    items,
    excluded,
    diagnostics,
    createdAt: packet.createdAt,
    packageHash: '',
  };
  manifest.packageHash = manifestHash(manifest);
  return manifest;
}
