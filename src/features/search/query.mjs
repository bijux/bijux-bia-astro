import { parseNumericRange } from "../../formatting/numeric-ranges.mjs";
export function generateParamString(baseURL, query, page, selectedFacets, pageSize, sortBy = "", sortOrder = "", sortSource = ""){
  const url = new URL(baseURL, "http://local");
  const isPageURL = url.origin === "http://local";
  const hasQuery = query !== undefined && query !== null && query !== "";
  const hasFacetValues = Object.values(selectedFacets ?? {}).some((values) => values?.length > 0);
  const shouldKeepSort = sortBy && (sortBy !== "relevance" || sortSource === "user" || hasQuery || hasFacetValues);

  if (hasQuery) {
    url.searchParams.set("query", query ?? "");
  }

  if (!isPageURL || pageSize > 12) {
    url.searchParams.set("pagination.page_size", String(pageSize));
  }

  if (!isPageURL) {
    url.searchParams.set("pagination.page", String(page));
  }

  url.searchParams.delete("sortBy");
  url.searchParams.delete("sortOrder");
  url.searchParams.delete("sort_by");
  url.searchParams.delete("sort_order");
  url.searchParams.delete("sort_source");

  if (shouldKeepSort) {
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_order", sortOrder || "desc");
    if (isPageURL && sortSource) {
      url.searchParams.set("sort_source", sortSource);
    }
  }

  for (const [facetKey, values] of Object.entries(selectedFacets ?? {})) {
    url.searchParams.delete(facetKey);
    url.searchParams.delete(`${facetKey}.eq`);
    url.searchParams.delete(`${facetKey}.gt`);
    url.searchParams.delete(`${facetKey}.gte`);
    url.searchParams.delete(`${facetKey}.lt`);
    url.searchParams.delete(`${facetKey}.lte`);

    if (!values?.length) continue;

    for (const value of values) {
      if (value === null || value === undefined) continue;
      const stringValue = String(value).trim();
      if (stringValue === "") continue;

      if (isPageURL) {
        url.searchParams.append(facetKey, stringValue);
      }
      else if (stringValue[0] === ">") {
        url.searchParams.append(`${facetKey}.gt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "<") {
        url.searchParams.append(`${facetKey}.lt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≤") {
        url.searchParams.append(`${facetKey}.lte`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≥") {
        url.searchParams.append(`${facetKey}.gte`, stringValue.slice(1));
      }
      else if (facetKey === "has_converted_image" && !isPageURL) {
        url.searchParams.append(url.pathname.endsWith("image") ? "has.converted_image" : "has.thumbnail", "true");
      }
      else {
        const range = parseNumericRange(stringValue);
        if (range) {
          url.searchParams.append(`${facetKey}.gte`, range.start);
          url.searchParams.append(`${facetKey}.lte`, range.end);
        } else {
          url.searchParams.append(`${facetKey}.eq`, stringValue);
        }
      }
    }
  }

  return isPageURL ? `${url.pathname}${url.search}` : url.toString()
}

/** Serialize successful native form controls while omitting incidental default sort. */
export function formSearchURL(action, entries, origin) {
    const url = new URL(action, origin);
    url.search = '';
    for (const [key, value] of entries) if (value !== '') url.searchParams.append(key, value.toString());
    const controls = new Set(['pagination.page', 'pagination.page_size', 'cursor', 'sort_by', 'sort_order', 'sort_source']);
    const hasCriteria = [...url.searchParams].some(([key, value]) => value !== '' && !controls.has(key));
    if (!hasCriteria && url.searchParams.get('sort_by') === 'relevance' && url.searchParams.get('sort_source') !== 'user') {
        for (const key of ['sort_by', 'sort_order', 'sort_source']) url.searchParams.delete(key);
    }
    return url;
}
