import { estimateTokens, makeId, nowIso } from './util.js';
export const manualMemoryPolicy = {
    mode: 'manual',
};
export function memoryRecordFromCandidate(candidate, decision) {
    const now = nowIso();
    const id = decision?.record?.id ?? makeId('mem', `${candidate.scope}:${candidate.layer}:${candidate.text}`);
    return {
        id,
        layer: candidate.layer,
        scope: candidate.scope,
        text: candidate.text,
        source: candidate.source,
        tags: candidate.tags,
        importance: candidate.importance,
        confidence: candidate.confidence,
        createdAt: decision?.record?.createdAt ?? now,
        updatedAt: decision?.record?.updatedAt ?? now,
        expiresAt: decision?.record?.expiresAt,
        status: decision?.record?.status ?? 'active',
        supersedes: decision?.record?.supersedes,
        metadata: { ...candidate.metadata, ...decision?.record?.metadata },
    };
}
export function memoryToChunk(record) {
    const source = record.source ?? {
        sourceId: record.id,
        sourceKind: 'memory',
        title: `Memory ${record.scope}`,
    };
    return {
        id: makeId('chunk', `memory:${record.id}:${record.updatedAt ?? record.createdAt}:${record.text}`),
        source: { ...source, sourceKind: source.sourceKind || 'memory' },
        text: record.text,
        layer: record.layer,
        trust: 'user',
        metadata: {
            ...(record.metadata ?? {}),
            memoryId: record.id,
            scope: record.scope,
            tags: record.tags ?? [],
            importance: record.importance ?? 0,
            confidence: record.confidence ?? 0,
            status: record.status ?? 'active',
        },
        tokensEstimated: estimateTokens(record.text),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
/**
 * Mode x hook contract:
 * - `manual`: never stores; `shouldStore` is not consulted.
 * - `suggested`: never stores directly. If `shouldStore` approves, the decision comes
 *   back as `{ store: false, suggested: true }` so the app can route it to an approval
 *   UI and call `addMemory` itself once approved.
 * - `auto`: `shouldStore` decides; defaults to storing when no hook is configured.
 */
export async function shouldStoreMemory(policy, candidate) {
    if (policy.mode === 'manual')
        return { store: false, reason: 'manual memory mode never auto-stores' };
    if (policy.mode === 'suggested') {
        if (!policy.shouldStore)
            return { store: false, suggested: true, reason: 'suggested memory requires app approval' };
        const decision = await policy.shouldStore(candidate);
        if (!decision.store)
            return decision;
        return { ...decision, store: false, suggested: true };
    }
    if (policy.shouldStore)
        return policy.shouldStore(candidate);
    return { store: true, reason: 'auto memory policy allowed storage' };
}
//# sourceMappingURL=memory.js.map