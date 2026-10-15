/** Synthetic cursor-window boundaries; the unchanged capture supplies each row's metadata. */
export function cursorSearchResponse(captured, url) {
    const size = Number(url.searchParams.get('pagination.page_size') ?? 12);
    const cursor = url.searchParams.get('cursor')?.match(/^cursor-(\d+)$/);
    const page = cursor ? Number(cursor[1]) : Number(url.searchParams.get('pagination.page') ?? 1);
    const total = 10050;
    const count = Math.max(0, Math.min(size, total - (page - 1) * size));
    const response = structuredClone(captured);
    response.hits = { total: { value: total, relation: 'eq' }, hits: Array.from({ length: count }, (_, index) => ({
        ...response.hits.hits[0], _source: { ...response.hits.hits[0]._source,
            uuid: `00000000-0000-4000-8000-${String((page - 1) * size + index).padStart(12, '0')}` },
    })) };
    response.pagination = { page, page_size: size, total_pages: Math.ceil(total / size),
        next_cursor: page * size < total ? `cursor-${page + 1}` : null };
    return response;
}
