export function stableHash(input) {
    // Two-lane FNV-1a 32-bit (~64 bits combined), small and deterministic across
    // runtimes. Widened from a single 32-bit lane to push the birthday-bound
    // collision point from ~77k inputs out to astronomically large corpora.
    let h1 = 0x811c9dc5;
    let h2 = (0x1000193 ^ input.length) >>> 0;
    for (let i = 0; i < input.length; i += 1) {
        const c = input.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= c;
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return `${h1.toString(36).padStart(7, '0')}${h2.toString(36).padStart(7, '0')}`;
}
export function makeId(prefix, seed) {
    return `${prefix}_${stableHash(seed)}`;
}
export function estimateTokens(text) {
    if (!text)
        return 0;
    // Deliberately approximate. Context Nugget should not require tokenizer deps.
    return Math.ceil(text.length / 4);
}
export function uniqueBy(items, key) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const k = key(item);
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push(item);
    }
    return out;
}
export function nowIso() {
    return new Date().toISOString();
}
export function metadataMatches(metadata, filters) {
    if (!filters)
        return true;
    for (const [key, expected] of Object.entries(filters)) {
        const actual = metadata?.[key];
        if (Array.isArray(expected)) {
            if (!expected.includes(actual))
                return false;
            continue;
        }
        if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
            const expectedRecord = expected;
            if (expectedRecord.in && !expectedRecord.in.includes(actual))
                return false;
            if (typeof expectedRecord.exists === 'boolean') {
                const exists = actual !== undefined && actual !== null;
                if (exists !== expectedRecord.exists)
                    return false;
            }
            continue;
        }
        if (actual !== expected)
            return false;
    }
    return true;
}
export function clamp01(value) {
    if (Number.isNaN(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
export function daysSince(iso) {
    if (!iso)
        return null;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms))
        return null;
    return Math.max(0, (Date.now() - ms) / 86_400_000);
}
export function recencyBoost(iso, halfLifeDays = 30) {
    const days = daysSince(iso);
    if (days === null)
        return 0;
    return Math.exp(-days / halfLifeDays);
}
//# sourceMappingURL=util.js.map