import type { ContextPack } from './types.js';

export interface AiNuggetCompatibleMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

export function asAiNuggetMetadata(pack: ContextPack): Record<string, unknown> {
  return {
    contextPacketId: pack.packet.id,
    contextRetrievalMode: pack.packet.retrievalMode,
    contextDegraded: pack.packet.degraded ?? false,
    contextSources: pack.sources,
    contextCitations: pack.citations,
    contextTokensEstimated: pack.tokensEstimated,
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
export function hasAiNuggetContext(metadata: Record<string, unknown> | undefined): boolean {
  return typeof metadata?.contextPacketId === 'string';
}
