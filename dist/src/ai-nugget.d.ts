import type { ContextPack } from './types.js';
export interface AiNuggetCompatibleMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare function asAiNuggetContextMessages(pack: ContextPack): AiNuggetCompatibleMessage[];
export declare function asAiNuggetMetadata(pack: ContextPack): Record<string, unknown>;
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
export declare function hasAiNuggetContext(metadata: Record<string, unknown> | undefined): boolean;
