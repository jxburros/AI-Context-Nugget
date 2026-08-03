import { applyContextBudget } from './budget.js';
import { attachCitations, citationKey, createCitation, formatSourceLabel } from './citations.js';
import { buildManifest } from './manifest.js';
import { redactText, wrapUntrustedSourceData } from './safety.js';
import { estimateTokens, makeId, nowIso, uniqueBy } from './util.js';
/** Chunk metadata keys copied into packet items under the default `'minimal'` metadata policy. */
export const METADATA_ALLOWLIST = [
    'chunkIndex',
    'headingPath',
    'startWord',
    'endWord',
    'memoryId',
    'scope',
    'tags',
    'importance',
    'confidence',
    'status',
];
function applyMetadataPolicy(metadata, policy) {
    if (!metadata)
        return {};
    if (policy === 'all')
        return { ...metadata };
    if (typeof policy === 'function')
        return policy(metadata);
    const out = {};
    for (const key of METADATA_ALLOWLIST) {
        if (key in metadata)
            out[key] = metadata[key];
    }
    return out;
}
/**
 * Default per-item packing overhead charged during budgeting: approximates the
 * rendered item header (`### [1] label`) plus blank-line separators, so
 * `maxTokens` bounds what actually ships, not just raw chunk text.
 */
export function defaultItemOverheadTokens(result) {
    return estimateTokens(`### [00] ${formatSourceLabel(result.chunk.source)}`) + 2;
}
/**
 * One-time packing overhead for pack-level framing: the heading line plus the
 * untrusted-source-data fence when enabled.
 */
export function estimatePackFixedOverheadTokens(options = {}) {
    const heading = options.heading ?? 'Relevant context';
    let tokens = heading ? estimateTokens(`## ${heading}`) + 1 : 0;
    if (options.trustBoundary === 'untrusted-source-data') {
        tokens += estimateTokens(wrapUntrustedSourceData('', { nonce: options.trustBoundaryNonce }));
    }
    return tokens;
}
export function packetFromResults(results, options) {
    const budget = options.budget ?? {};
    const report = applyContextBudget(results, budget, options.budgetOptions ?? { overheadTokensPerItem: defaultItemOverheadTokens });
    const baseItems = report.included.map((result) => ({
        id: result.chunk.id,
        text: result.chunk.text,
        source: result.chunk.source,
        score: result.score,
        layer: result.layer ?? result.chunk.layer,
        trust: result.chunk.trust,
        authorityClass: result.chunk.authorityClass,
        tokensEstimated: result.chunk.tokensEstimated ?? estimateTokens(result.chunk.text),
        metadata: {
            ...applyMetadataPolicy(result.chunk.metadata, options.metadataPolicy),
            scoreBreakdown: result.scoreBreakdown,
            reasons: result.reasons,
        },
    }));
    const items = attachCitations(baseItems);
    const sources = uniqueBy(items.map((item) => item.source), citationKey);
    const layers = options.layers?.length ? options.layers : uniqueBy(items.map((item) => item.layer).filter((l) => Boolean(l)), (l) => l);
    const visibilitySummary = `Included ${items.length} item${items.length === 1 ? '' : 's'} from ${sources.length} source${sources.length === 1 ? '' : 's'} across ${layers.length} layer${layers.length === 1 ? '' : 's'}.`;
    const exclusions = [
        ...(options.policyExclusions ?? []),
        ...report.exclusions.map((exclusion) => ({
            id: exclusion.result.chunk.id,
            locator: exclusion.result.chunk.source,
            score: exclusion.result.score,
            reasons: exclusion.reasons,
        })),
    ];
    const diagnosticsReasons = [...(options.diagnosticsReasons ?? []), ...report.reasons];
    return {
        id: makeId('packet', `${options.query}:${nowIso()}:${items.map((i) => i.id).join(',')}`),
        query: options.query,
        layers,
        items,
        sources,
        budget,
        retrievalMode: options.retrievalMode ?? 'none',
        degraded: options.degraded,
        degradedReason: options.degradedReason,
        visibilitySummary,
        createdAt: nowIso(),
        exclusions: exclusions.length > 0 ? exclusions : undefined,
        diagnostics: {
            searchedChunks: options.candidateChunks ?? results.length,
            candidateChunks: options.candidateChunks ?? results.length,
            retrievedResults: results.length,
            returnedItems: items.length,
            excludedItems: report.excluded.length,
            estimatedTokens: report.tokensEstimated,
            estimatedChars: report.chars,
            overheadTokens: report.overheadTokens,
            reasons: diagnosticsReasons.length > 0 ? diagnosticsReasons : undefined,
        },
    };
}
function itemHeader(item, options) {
    const citation = item.citation?.label ?? formatSourceLabel(item.source);
    const extras = [];
    if (options.includeScores && typeof item.score === 'number')
        extras.push(`score ${item.score.toFixed(3)}`);
    if (options.includeTrust && item.trust)
        extras.push(`trust ${item.trust}`);
    if (item.layer)
        extras.push(`layer ${item.layer}`);
    return extras.length ? `${citation} (${extras.join('; ')})` : citation;
}
/**
 * Partitions items for display: groups keyed by source or layer, ordered by
 * each group's first occurrence in ranked order, items keeping ranked order
 * within their group. Purely a stable partition — no re-scoring or sorting.
 */
function groupItemsForDisplay(items, groupBy) {
    const groups = new Map();
    for (const item of items) {
        const key = groupBy === 'source' ? item.source.sourceId : String(item.layer ?? '');
        const existing = groups.get(key);
        if (existing) {
            existing.items.push(item);
            continue;
        }
        const label = groupBy === 'layer'
            ? (item.layer ? `Layer: ${item.layer}` : 'Layer: (none)')
            : item.source.title ?? item.source.path ?? item.source.url ?? item.source.sourceId;
        groups.set(key, { label, items: [item] });
    }
    return [...groups.values()];
}
export function packContext(packet, options = {}) {
    const includeCitations = options.includeCitations ?? true;
    const heading = options.heading ?? 'Relevant context';
    const redact = options.redact === true ? redactText : typeof options.redact === 'function' ? options.redact : undefined;
    const itemText = (item) => (redact ? redact(item.text) : item.text).trim();
    const lines = [];
    // With groupBy, only the display order changes; packet.items keeps ranked
    // order. Citations are re-attached over the display order so rendered
    // numbers read 1..n top to bottom.
    let groups;
    let displayItems = packet.items;
    if (options.groupBy && packet.items.length > 0) {
        const grouped = groupItemsForDisplay(packet.items, options.groupBy);
        const renumbered = attachCitations(grouped.flatMap((group) => group.items).map(({ citation: _citation, ...rest }) => rest));
        let cursor = 0;
        groups = grouped.map((group) => {
            const items = renumbered.slice(cursor, cursor + group.items.length);
            cursor += group.items.length;
            return { label: group.label, items };
        });
        displayItems = renumbered;
    }
    if (options.format === 'plain') {
        if (heading)
            lines.push(heading, '');
        if (groups) {
            for (const group of groups) {
                lines.push(group.label, '');
                for (const item of group.items) {
                    lines.push(itemHeader(item, options));
                    lines.push(itemText(item));
                    lines.push('');
                }
            }
        }
        else {
            for (const item of displayItems) {
                lines.push(itemHeader(item, options));
                lines.push(itemText(item));
                lines.push('');
            }
        }
    }
    else {
        if (heading)
            lines.push(`## ${heading}`, '');
        if (packet.degraded && packet.degradedReason)
            lines.push(`_Retrieval degraded: ${packet.degradedReason}_`, '');
        if (groups) {
            for (const group of groups) {
                lines.push(`### ${group.label}`, '');
                for (const item of group.items) {
                    lines.push(`#### ${itemHeader(item, options)}`);
                    lines.push('');
                    lines.push(itemText(item));
                    lines.push('');
                }
            }
        }
        else {
            for (const item of displayItems) {
                lines.push(`### ${itemHeader(item, options)}`);
                lines.push('');
                lines.push(itemText(item));
                lines.push('');
            }
        }
    }
    let text = lines.join('\n').trim();
    if (options.trustBoundary === 'untrusted-source-data')
        text = wrapUntrustedSourceData(text, { nonce: options.trustBoundaryNonce });
    const citations = includeCitations
        ? displayItems.map((item, i) => item.citation ?? createCitation(item.source, i + 1))
        : [];
    const pack = {
        packet,
        text,
        citations,
        sources: packet.sources,
        tokensEstimated: estimateTokens(text),
    };
    if (options.includeManifest ?? true) {
        pack.manifest = buildManifest(packet, pack);
    }
    return pack;
}
//# sourceMappingURL=pack.js.map