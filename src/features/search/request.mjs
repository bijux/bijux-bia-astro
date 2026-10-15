import { searchLimits } from '../../api/contracts.mjs';

/** Reject hostile numeric/resource inputs before constructing any upstream request. */
export function searchRequest(url) {
    const values = [...url.searchParams];
    if (values.length > searchLimits.parameters || values.some(([key, value]) => key.length > 128 || value.length > searchLimits.value)) {
        throw new RangeError("Search parameters exceed the supported limits.");
    }
    function integer(name, fallback, maximum) {
        const entries = url.searchParams.getAll(name);
        if (!entries.length) return fallback;
        if (entries.length === 1 && entries[0] === "") return fallback;
        if (entries.length !== 1 || !/^[1-9]\d*$/.test(entries[0])) throw new RangeError(`Invalid ${name}.`);
        const value = Number(entries[0]);
        if (!Number.isSafeInteger(value) || value > maximum) throw new RangeError(`Invalid ${name}.`);
        return value;
    }
    const query = url.searchParams.get("query") ?? "";
    const cursor = url.searchParams.get("cursor");
    if (query.length > searchLimits.query || (cursor?.length ?? 0) > searchLimits.cursor || url.searchParams.getAll("cursor").length > 1 || url.searchParams.getAll("query").length > 1) {
        throw new RangeError("Search query or cursor exceeds the supported limits.");
    }
    return { page: integer("pagination.page", 1, searchLimits.page), pageSize: integer("pagination.page_size", 12, searchLimits.pageSize), cursor, query };
}
