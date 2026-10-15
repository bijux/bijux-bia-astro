import { searchRequest } from './request.mjs';
import { getFacetQueryValues as readFacetQueryValues } from './facet-options.mjs';
import type { SelectedFacets, SearchScope } from './types.ts';

/** Canonical selection/sort rules shared by server rendering and browser URL handling. */
export function readSearchState(url: URL, query: string, searchType: SearchScope) {
    const hasSortParam = url.searchParams.has("sort_by") || url.searchParams.has("sort_order") || url.searchParams.has("sortBy") || url.searchParams.has("sortOrder");
    const hasPageSizeParam = url.searchParams.has("pagination.page_size");
    const hasSearchQuery = query !== undefined && query !== null && query !== "";
    const releaseDateSortField = searchType === "image" ? "study_release_date" : "release_date";
    const requestedSortBy = url.searchParams.get("sort_by") || url.searchParams.get("sortBy") || "relevance";
    const requestedSortOrder = url.searchParams.get("sort_order") || url.searchParams.get("sortOrder") || "desc";
    const requestedSortSource = url.searchParams.get("sort_source") || "";
    const normalizedSortBy =
      requestedSortBy === "accession"
        ? "accession_id"
        : requestedSortBy === "release_date" || requestedSortBy === "study_release_date"
          ? releaseDateSortField
          : requestedSortBy;
    const sortBy = ["relevance", "accession_id", releaseDateSortField].includes(normalizedSortBy) ? normalizedSortBy : "relevance";
    const normalizedSortOrder = requestedSortOrder === "ascending" ? "asc" : requestedSortOrder === "descending" ? "desc" : requestedSortOrder;
    const sortOrder = ["asc", "desc"].includes(normalizedSortOrder) ? normalizedSortOrder : "desc";
    let status = 200;
    let requestError = "";
    let parameters: {page: number; pageSize: number; cursor: string | null} = { page: 1, pageSize: 12, cursor: null };
    try { parameters = searchRequest(url); } catch { requestError = "Search parameters exceed the supported limits or are invalid."; status = 400; }
    const { page, pageSize, cursor } = parameters;
    const maxResultWindow = 10000;
    const cappedPage = Math.max(1, Math.floor(maxResultWindow / pageSize));
    const displayPage = cursor ? Math.max(cappedPage + 1, page) : page;

    function getFacetQueryValues(paramName: string) {
      return readFacetQueryValues(url.searchParams, paramName);
    }

    const selectedFacets: SelectedFacets = {
      "facet.organism": getFacetQueryValues("facet.organism"),
      "facet.imaging_method": getFacetQueryValues("facet.imaging_method"),
      "facet.year": getFacetQueryValues("facet.year"),
      "facet.annotation_method": getFacetQueryValues("facet.annotation_method"),
      "has_converted_image": getFacetQueryValues("has_converted_image"),
      "facet.image_format": getFacetQueryValues("facet.image_format"),
      "facet.licence": getFacetQueryValues("facet.licence"),
      "facet.file_type": getFacetQueryValues("facet.file_type"),
      "size_c": getFacetQueryValues("size_c"),
      "total_size_in_bytes": getFacetQueryValues("total_size_in_bytes"),
      "size_x": getFacetQueryValues("size_x"),
      "size_y": getFacetQueryValues("size_y"),
      "size_z": getFacetQueryValues("size_z"),
      "size_t": getFacetQueryValues("size_t"),
      "total_physical_size_x": getFacetQueryValues("total_physical_size_x"),
      "total_physical_size_y": getFacetQueryValues("total_physical_size_y"),
      "total_physical_size_z": getFacetQueryValues("total_physical_size_z"),
      "image_pixel_z": getFacetQueryValues("image_pixel_z"),
      "voxel_physical_size_z": getFacetQueryValues("voxel_physical_size_z"),
      "voxel_physical_size_y": getFacetQueryValues("voxel_physical_size_y"),
      "voxel_physical_size_x": getFacetQueryValues("voxel_physical_size_x"),
    };

    const hasSelectedFilters = Object.values(selectedFacets).some((values) => values?.length > 0);
    const isUserSelectedSort = requestedSortSource === "user" || (hasSortParam && sortBy !== "relevance");
    const shouldApplySort = hasSortParam || hasSearchQuery;
    const shouldKeepSort = shouldApplySort && (isUserSelectedSort || hasSearchQuery || hasSelectedFilters);
    const sortSource = isUserSelectedSort ? "user" : "query";
    return { page, pageSize, cursor, cappedPage, displayPage, selectedFacets, sortBy, sortOrder,
        sortSource, shouldKeepSort, releaseDateSortField, hasPageSizeParam, requestError, status };
}

/** Applying a toolbar change keeps query/facets and discards paging from the old selection. */
export function changedSearchURL(value: URL | string, change: { pageSize: string } | { sortBy: string; sortOrder: string; reset: boolean }) {
    const url = new URL(value.toString());
    if ('pageSize' in change) url.searchParams.set('pagination.page_size', change.pageSize);
    else {
        for (const key of ['sortBy', 'sortOrder', 'sort_by', 'sort_order', 'sort_source']) url.searchParams.delete(key);
        if (!change.reset && (change.sortBy || change.sortOrder)) {
            url.searchParams.set('sort_by', change.sortBy || 'relevance');
            url.searchParams.set('sort_order', change.sortOrder || 'desc');
            url.searchParams.set('sort_source', 'user');
        }
    }
    url.searchParams.delete('pagination.page');
    url.searchParams.delete('cursor');
    return url;
}
