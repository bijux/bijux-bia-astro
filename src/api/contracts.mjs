const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

/** Preserve API records; validate only the envelope and identity needed by callers. */
export function hitRecords(value) {
    if (!object(value) || !object(value.hits) || !Array.isArray(value.hits.hits) || value.hits.hits.some(hit => !object(hit) || !object(hit._source))) throw new TypeError('Invalid entity response.');
    return value.hits.hits;
}

export function selectedEntity(value, key, identifier) {
    const matches = hitRecords(value).filter(hit => hit._source[key] === identifier);
    if (matches.length > 1) throw new TypeError('Ambiguous entity response.');
    return matches[0]?._source;
}

export function cataloguePage(value, page, pageSize, expectedTotal) {
    const hits = hitRecords(value);
    const total = value.hits.total;
    const pages = value.pagination?.total_pages ?? 1;
    if (!integer(total?.value) || total.relation != null && total.relation !== 'eq' || expectedTotal != null && total.value !== expectedTotal || !integer(pages) || pages > 10000 || hits.length > pageSize || value.pagination?.page != null && value.pagination.page !== page || pages === 0 && hits.length) throw new TypeError('Invalid or changing catalogue response.');
    return { hits, total: total.value, pages };
}

export function imageRecord(value) {
    if (!object(value) || typeof value.uuid !== 'string' || !Array.isArray(value.representation) || value.representation.some(item => !object(item))) throw new TypeError('Invalid image record.');
    return value;
}

export function imageCount(value) {
    if (!integer(value?.hits?.total?.value)) throw new TypeError('Invalid image count.');
    return value.hits.total.value;
}
