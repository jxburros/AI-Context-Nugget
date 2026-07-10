import { applyContextBudget } from './budget.js';
import { attachCitations, citationKey, createCitation, formatSourceLabel } from './citations.js';
import { redactText, wrapUntrustedSourceData } from './safety.js';
import { estimateTokens, makeId, nowIso, uniqueBy } from './util.js';
/** Chunk metadata keys copied into packet items under the default `'minimal'` metadata policy. */
const METADATA_ALLOWLIST = ['chunkIndex', 'headingPath', 'memoryId', 'scope', 'tags', 'importance', 'confidence', 'status'];
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
export function packetFromResults(results, options) {
    const budget = options.budget ?? {};
    const report = applyContextBudget(results, budget);
    const baseItems = report.included.map((result) => ({
        id: result.chunk.id,
        text: result.chunk.text,
        source: result.chunk.source,
        score: result.score,
        layer: result.layer ?? result.chunk.layer,
        trust: result.chunk.trust,
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
        diagnostics: {
            searchedChunks: options.candidateChunks ?? results.length,
            candidateChunks: options.candidateChunks ?? results.length,
            retrievedResults: results.length,
            returnedItems: items.length,
            excludedItems: report.excluded.length,
            estimatedTokens: report.tokensEstimated,
            estimatedChars: report.chars,
            reasons: options.diagnosticsReasons,
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
export function packContext(packet, options = {}) {
    const includeCitations = options.includeCitations ?? true;
    const heading = options.heading ?? 'Relevant context';
    const redact = options.redact === true ? redactText : typeof options.redact === 'function' ? options.redact : undefined;
    const itemText = (item) => (redact ? redact(item.text) : item.text).trim();
    const lines = [];
    if (options.format === 'plain') {
        if (heading)
            lines.push(heading, '');
        for (const item of packet.items) {
            lines.push(itemHeader(item, options));
            lines.push(itemText(item));
            lines.push('');
        }
    }
    else {
        if (heading)
            lines.push(`## ${heading}`, '');
        if (packet.degraded && packet.degradedReason)
            lines.push(`_Retrieval degraded: ${packet.degradedReason}_`, '');
        for (const item of packet.items) {
            lines.push(`### ${itemHeader(item, options)}`);
            lines.push('');
            lines.push(itemText(item));
            lines.push('');
        }
    }
    let text = lines.join('\n').trim();
    if (options.trustBoundary === 'untrusted-source-data')
        text = wrapUntrustedSourceData(text, { nonce: options.trustBoundaryNonce });
    const citations = includeCitations
        ? packet.items.map((item, i) => item.citation ?? createCitation(item.source, i + 1))
        : [];
    return {
        packet,
        text,
        citations,
        sources: packet.sources,
        tokensEstimated: estimateTokens(text),
    };
}
//# sourceMappingURL=pack.js.map