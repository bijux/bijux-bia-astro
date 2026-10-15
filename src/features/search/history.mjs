import { searchRequest } from './request.mjs';

/** Public history omits transport cursors while retaining query, filters and page size. */
export function cleanHistoryURL(value, origin) {
    const url = new URL(value.toString(), origin);
    for (const key of ['pagination.page', 'cursor', 'page', 'prev_cursor_1', 'prev_cursor_2']) url.searchParams.delete(key);
    return url;
}

/** Restore private transport state only for the same visible, credential-free search URL. */
export function historyRequestURL(value, state) {
    const current = new URL(value.toString());
    if (typeof state?.fetchURL !== 'string') return current;
    try {
        const saved = new URL(state.fetchURL);
        searchRequest(saved);
        if (saved.origin === current.origin && !saved.username && !saved.password &&
            cleanHistoryURL(saved, current.origin).href === cleanHistoryURL(current, current.origin).href) return saved;
    } catch { /* Invalid saved state cannot change the current destination. */ }
    return current;
}
