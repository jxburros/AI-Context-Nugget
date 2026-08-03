import { estimateTokens, stableHash } from './util.js';
export const MANIFEST_VERSION = 1;
/** Deterministic JSON: recursively sorted object keys, `undefined` values dropped. */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalJson(entry === undefined ? null : entry)).join(',')}]`;
    }
    const record = value;
    const parts = [];
    for (const key of Object.keys(record).sort()) {
        const entry = record[key];
        if (entry === undefined)
            continue;
        parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
    }
    return `{${parts.join(',')}}`;
}
function hashProjection(manifest) {
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
export function manifestHash(manifest) {
    return stableHash(canonicalJson(hashProjection(manifest)));
}
/** True when `manifest.packageHash` matches its recomputed hash. */
export function verifyManifest(manifest) {
    return manifest.packageHash === manifestHash(manifest);
}
/**
 * Builds a manifest from a packet (and optionally the rendered pack, for the
 * measured `packTokensEstimated`). `packContext` calls this by default;
 * apps assembling packets manually can call it standalone.
 */
export function buildManifest(packet, pack) {
    const items = packet.items.map((item) => {
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
            scoreBreakdown: scoreBreakdown && typeof scoreBreakdown === 'object' ? scoreBreakdown : undefined,
            selectionReasons: Array.isArray(reasons) ? reasons : [],
            tokensEstimated: item.tokensEstimated ?? estimateTokens(item.text),
            contentHash: stableHash(item.text),
        };
    });
    const excluded = (packet.exclusions ?? []).map((exclusion) => ({
        id: exclusion.id,
        locator: exclusion.locator,
        score: exclusion.score,
        reasons: exclusion.reasons,
    }));
    const diagnostics = packet.diagnostics;
    const manifest = {
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
//# sourceMappingURL=manifest.js.map