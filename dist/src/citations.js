function joinDefined(parts, sep) {
    return parts.filter((p) => Boolean(p && p.trim())).join(sep);
}
export function formatSourceLabel(source) {
    const base = source.title ?? source.path ?? source.url ?? source.sourceId;
    const section = source.section ? ` > ${source.section}` : '';
    const page = source.page !== undefined ? ` p.${source.page}` : '';
    const lines = source.lineStart !== undefined
        ? ` L${source.lineStart}${source.lineEnd !== undefined && source.lineEnd !== source.lineStart ? `-L${source.lineEnd}` : ''}`
        : '';
    return `${base}${section}${page}${lines}`;
}
export function createCitation(source, index) {
    return {
        id: `c${index}`,
        label: `[${index}] ${formatSourceLabel(source)}`,
        source,
    };
}
export function citationKey(source) {
    return joinDefined([
        source.sourceId,
        source.sourceKind,
        source.path,
        source.url,
        source.section,
        source.page === undefined ? undefined : String(source.page),
        source.lineStart === undefined ? undefined : String(source.lineStart),
        source.lineEnd === undefined ? undefined : String(source.lineEnd),
    ], '|');
}
export function attachCitations(items) {
    return items.map((item, index) => ({ ...item, citation: createCitation(item.source, index + 1) }));
}
//# sourceMappingURL=citations.js.map