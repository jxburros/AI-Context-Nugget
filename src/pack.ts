import type {
  Citation,
  ContextBudget,
  ContextItem,
  ContextLayer,
  ContextPack,
  ContextPacket,
  PacketExclusion,
  PackOptions,
  RetrievalResult,
} from './types.js';
import { applyContextBudget, type BudgetOptions } from './budget.js';
import { attachCitations, citationKey, createCitation, formatSourceLabel } from './citations.js';
import { buildManifest } from './manifest.js';
import { redactText, wrapUntrustedSourceData } from './safety.js';
import { estimateTokens, makeId, nowIso, uniqueBy } from './util.js';

export type MetadataPolicy = 'all' | 'minimal' | ((metadata: Record<string, unknown>) => Record<string, unknown>);

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
] as const;

function applyMetadataPolicy(metadata: Record<string, unknown> | undefined, policy: MetadataPolicy | undefined): Record<string, unknown> {
  if (!metadata) return {};
  if (policy === 'all') return { ...metadata };
  if (typeof policy === 'function') return policy(metadata);
  const out: Record<string, unknown> = {};
  for (const key of METADATA_ALLOWLIST) {
    if (key in metadata) out[key] = metadata[key];
  }
  return out;
}

/**
 * Default per-item packing overhead charged during budgeting: approximates the
 * rendered item header (`### [1] label`) plus blank-line separators, so
 * `maxTokens` bounds what actually ships, not just raw chunk text.
 */
export function defaultItemOverheadTokens(result: RetrievalResult): number {
  return estimateTokens(`### [00] ${formatSourceLabel(result.chunk.source)}`) + 2;
}

/**
 * One-time packing overhead for pack-level framing: the heading line plus the
 * untrusted-source-data fence when enabled.
 */
export function estimatePackFixedOverheadTokens(options: PackOptions = {}): number {
  const heading = options.heading ?? 'Relevant context';
  let tokens = heading ? estimateTokens(`## ${heading}`) + 1 : 0;
  if (options.trustBoundary === 'untrusted-source-data') {
    tokens += estimateTokens(wrapUntrustedSourceData('', { nonce: options.trustBoundaryNonce }));
  }
  return tokens;
}

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

export function packetFromResults(results: RetrievalResult[], options: PacketOptions): ContextPacket {
  const budget = options.budget ?? {};
  const report = applyContextBudget(results, budget, options.budgetOptions ?? { overheadTokensPerItem: defaultItemOverheadTokens });
  const baseItems: Omit<ContextItem, 'citation'>[] = report.included.map((result) => ({
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
  const layers = options.layers?.length ? options.layers : uniqueBy(items.map((item) => item.layer).filter((l): l is ContextLayer => Boolean(l)), (l) => l);
  const visibilitySummary = `Included ${items.length} item${items.length === 1 ? '' : 's'} from ${sources.length} source${sources.length === 1 ? '' : 's'} across ${layers.length} layer${layers.length === 1 ? '' : 's'}.`;
  const exclusions: PacketExclusion[] = [
    ...(options.policyExclusions ?? []),
    ...report.exclusions.map((exclusion) => ({
      id: exclusion.result.chunk.id,
      locator: exclusion.result.chunk.source,
      score: exclusion.result.score,
      reasons: exclusion.reasons as string[],
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

function itemHeader(item: ContextItem, options: PackOptions): string {
  const citation = item.citation?.label ?? formatSourceLabel(item.source);
  const extras: string[] = [];
  if (options.includeScores && typeof item.score === 'number') extras.push(`score ${item.score.toFixed(3)}`);
  if (options.includeTrust && item.trust) extras.push(`trust ${item.trust}`);
  if (item.layer) extras.push(`layer ${item.layer}`);
  return extras.length ? `${citation} (${extras.join('; ')})` : citation;
}

interface DisplayGroup {
  label: string;
  items: ContextItem[];
}

/**
 * Partitions items for display: groups keyed by source or layer, ordered by
 * each group's first occurrence in ranked order, items keeping ranked order
 * within their group. Purely a stable partition — no re-scoring or sorting.
 */
function groupItemsForDisplay(items: ContextItem[], groupBy: 'source' | 'layer'): DisplayGroup[] {
  const groups = new Map<string, DisplayGroup>();
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

export function packContext(packet: ContextPacket, options: PackOptions = {}): ContextPack {
  const includeCitations = options.includeCitations ?? true;
  const heading = options.heading ?? 'Relevant context';
  const redact: ((text: string) => string) | undefined =
    options.redact === true ? redactText : typeof options.redact === 'function' ? options.redact : undefined;
  const itemText = (item: ContextItem): string => (redact ? redact(item.text) : item.text).trim();
  const lines: string[] = [];

  // With groupBy, only the display order changes; packet.items keeps ranked
  // order. Citations are re-attached over the display order so rendered
  // numbers read 1..n top to bottom.
  let groups: DisplayGroup[] | undefined;
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
    if (heading) lines.push(heading, '');
    if (groups) {
      for (const group of groups) {
        lines.push(group.label, '');
        for (const item of group.items) {
          lines.push(itemHeader(item, options));
          lines.push(itemText(item));
          lines.push('');
        }
      }
    } else {
      for (const item of displayItems) {
        lines.push(itemHeader(item, options));
        lines.push(itemText(item));
        lines.push('');
      }
    }
  } else {
    if (heading) lines.push(`## ${heading}`, '');
    if (packet.degraded && packet.degradedReason) lines.push(`_Retrieval degraded: ${packet.degradedReason}_`, '');
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
    } else {
      for (const item of displayItems) {
        lines.push(`### ${itemHeader(item, options)}`);
        lines.push('');
        lines.push(itemText(item));
        lines.push('');
      }
    }
  }

  let text = lines.join('\n').trim();
  if (options.trustBoundary === 'untrusted-source-data') text = wrapUntrustedSourceData(text, { nonce: options.trustBoundaryNonce });
  const citations: Citation[] = includeCitations
    ? displayItems.map((item, i) => item.citation ?? createCitation(item.source, i + 1))
    : [];
  const pack: ContextPack = {
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
