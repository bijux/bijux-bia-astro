import { PUBLIC_SEARCH_API } from 'astro:env/client';
import { createSearchClient } from './search.mjs';
import { createRequestJSON } from './http.mjs';

/** Construct this inside a request so responses never leak between page loads. */
export function createRequestClient(signal) {
    return createSearchClient(PUBLIC_SEARCH_API, createRequestJSON({ signal }));
}

export const { getStudyFromApiByAccession, getAllStudiesFromAPI } = createSearchClient(PUBLIC_SEARCH_API);
