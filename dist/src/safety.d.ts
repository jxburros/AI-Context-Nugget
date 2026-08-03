import type { AuthorityClass, ContextSource, ContextTrust } from './types.js';
export declare function redactText(text: string, replacement?: string): string;
export interface WrapUntrustedSourceDataOptions {
    /**
     * Per-pack random value appended to the fence delimiters (e.g. `== BEGIN
     * UNTRUSTED SOURCE DATA <nonce> ==`). Apps should supply a fresh nonce per
     * call so wrapped content cannot predict and pre-forge the exact fence text.
     * Context Nugget stays dependency-free and does not generate this itself.
     * Must match `[A-Za-z0-9_-]+`; anything else (spaces, `==`, newlines) would
     * make the fence ambiguous, so an invalid nonce throws.
     */
    nonce?: string;
}
export declare function wrapUntrustedSourceData(text: string, options?: WrapUntrustedSourceDataOptions): string;
export declare function trustForSource(source: ContextSource, fallback?: ContextTrust): ContextTrust;
/**
 * Default `AuthorityClass` for content when none is set explicitly. Kept
 * independent of `trust`: trust drives fencing/handling of retrieved text,
 * while authorityClass records what kind of authority the content carries
 * for audit and precedence decisions.
 */
export declare function defaultAuthorityClass(input: {
    kind?: string;
    trust?: ContextTrust;
    authorityClass?: AuthorityClass;
}): AuthorityClass;
export declare function isHiddenFromAI(source: ContextSource): boolean;
