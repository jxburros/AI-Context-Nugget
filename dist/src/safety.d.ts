import type { ContextSource, ContextTrust } from './types.js';
export declare function redactText(text: string, replacement?: string): string;
export interface WrapUntrustedSourceDataOptions {
    /**
     * Per-pack random value appended to the fence delimiters (e.g. `== BEGIN
     * UNTRUSTED SOURCE DATA <nonce> ==`). Apps should supply a fresh nonce per
     * call so wrapped content cannot predict and pre-forge the exact fence text.
     * Context Nugget stays dependency-free and does not generate this itself.
     */
    nonce?: string;
}
export declare function wrapUntrustedSourceData(text: string, options?: WrapUntrustedSourceDataOptions): string;
export declare function trustForSource(source: ContextSource, fallback?: ContextTrust): ContextTrust;
export declare function isHiddenFromAI(source: ContextSource): boolean;
