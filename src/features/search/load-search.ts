import { fetchJSON } from '../../api/http.mjs';
import { browseResponse } from '../../api/contracts.mjs';
import { generateParamString } from './query.mjs';
import { readSearchState } from './state.ts';
import { sortedSearchResults } from './results.ts';
import { searchFacets } from './facets.ts';
import type { SearchHits, PaginationData, SearchScope, FacetView } from './types.ts';

export async function loadSearchPage(url: URL, query: string, searchType: SearchScope, apiURL: string, request = fetchJSON) {
    const state = readSearchState(url, query, searchType);
    const { page, pageSize, cursor, selectedFacets, sortBy, sortOrder, sortSource, shouldKeepSort, releaseDateSortField } = state;
    let { requestError, status } = state;
    const searchEndpoint = `${apiURL}/website/browse/${searchType}`;
    const searchPageURL = searchType === 'study' ? '/bioimage-archive/studies' : '/bioimage-archive/images';
    let hits: SearchHits | undefined;
    let facetData: Record<string, unknown> = {};
    let paginationData: Partial<PaginationData> = {};
    let facets: Record<string, FacetView> = {};

    const hasQueryParam = query || query ==="";
    if (hasQueryParam && !requestError) {
      const searchURL = generateParamString(
        searchEndpoint,
        query,
        page,
        selectedFacets,
        pageSize,
        shouldKeepSort ? sortBy : "",
        shouldKeepSort ? sortOrder : "",
        sortSource
      );

      const requestURL = new URL(searchURL, "http://local");
      if (cursor) {
        requestURL.searchParams.set("cursor", cursor);
        requestURL.searchParams.delete("pagination.page");
      }

      try {
        const data = browseResponse(await request(requestURL.toString()));
        hits = data.hits;
        facetData = data.facets;
        facets = searchFacets(facetData, selectedFacets, searchType);
        paginationData = data.pagination;
      } catch {
        hits = undefined;
        facets = {};
        paginationData = {};
        requestError = "Search is temporarily unavailable. Please try again later.";
        status = 502;
      }
    }


    const totalResults = hits?.total?.value ?? 0;
    const results = sortedSearchResults(hits?.hits, sortBy, sortOrder, releaseDateSortField);
    return { ...state, requestError, status, searchPageURL, paginationData, results, totalResults, facets, hasQueryParam };
}
