export interface TokenizeOptions {
    minLength?: number;
    stopwords?: Set<string>;
}
export declare const DEFAULT_STOPWORDS: Set<string>;
export declare function tokenize(text: string, options?: TokenizeOptions): string[];
export declare function uniqueTokens(text: string, options?: TokenizeOptions): string[];
