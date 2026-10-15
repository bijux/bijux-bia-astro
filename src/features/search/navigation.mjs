/** Public history omits transport cursors while retaining query, filters and page size. */
export function cleanHistoryURL(value, origin) {
    const url = new URL(value.toString(), origin);
    for (const key of ['pagination.page', 'cursor', 'page', 'prev_cursor_1', 'prev_cursor_2']) url.searchParams.delete(key);
    return url;
}
