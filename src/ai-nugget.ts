import type { Citation, ContextPack, ContextSourceRef } from './types.js';

export interface AiNuggetCompatibleMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * The metadata contract produced by `asAiNuggetMetadata`. Downstream apps
 * should type against this interface instead of relying on incidental keys.
 * `contextPacketId` is the stable presence signal (see `hasAiNuggetContext`).
 */
export interface AiNuggetMetadata {
  contextPacketId: string;
  contextRetrievalMode: string;
  contextDegraded: boolean;
  contextSources: ContextSourceRef[];
  contextCitations: Citation[];
  /** Token estimate of the rendered pack text; absent for hand-built packs without one. */
  contextTokensEstimated?: number;
  /** `manifest.packageHash` when the pack carries a manifest. */
  contextManifestHash?: string;
}

export function asAiNuggetContextMessages(pack: ContextPack): AiNuggetCompatibleMessage[] {
  if (!pack.text.trim()) return [];
  return [
    {
      role: 'system',
      content: pack.text,
    },
  ];
}

export function asAiNuggetMetadata(pack: ContextPack): AiNuggetMetadata {
  return {
    contextPacketId: pack.packet.id,
    contextRetrievalMode: pack.packet.retrievalMode,
    contextDegraded: pack.packet.degraded ?? false,
    contextSources: pack.sources,
    contextCitations: pack.citations,
    contextTokensEstimated: pack.tokensEstimated,
    contextManifestHash: pack.manifest?.packageHash,
  };
}

/**
 * Detects whether a chat call's metadata carries Context Nugget-packed
 * context, without inspecting message text. `asAiNuggetContextMessages`
 * puts the packed text (headers, trust-boundary fences, etc. all depend on
 * `PackOptions`) into a plain system message with no stable sentinel of its
 * own — matching on that text is fragile. `contextPacketId` in
 * `asAiNuggetMetadata`'s output is the stable signal: pass the same
 * `metadata` object given to `AIHandler.chat`/`.stream` (e.g. from a
 * `TelemetrySink` record or `CallInfo`) to check it after the fact.
 */
export function hasAiNuggetContext(
  metadata: Record<string, unknown> | undefined,
): metadata is Record<string, unknown> & { contextPacketId: string } {
  return typeof metadata?.contextPacketId === 'string';
}
