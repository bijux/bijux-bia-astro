import { readFileSync } from 'node:fs';

const saved = name => JSON.parse(readFileSync(new URL(`../api/${name}-response.json`, import.meta.url)));
const spatialomicsStudy = saved('study-s-biad1093').hits.hits[0]._source;
export const spatialomicsDatasets = spatialomicsStudy.dataset;
export const spatialomicsApiRoot = 'https://metadata-fixture.example.org/api/v2';
export const spatialomicsFiles = new Map(spatialomicsDatasets.map(dataset => [dataset.uuid, saved(`files-${dataset.uuid}`)]));

/** Complete public captures, with a separate synthetic browse envelope for the same five images. */
export function spatialomicsResponse(url) {
    const accession = url.searchParams.get('facet.accession_id');
    if (url.origin === new URL(spatialomicsApiRoot).origin) {
        const dataset = url.pathname.match(/^\/api\/v2\/dataset\/([^/]+)\/file_reference$/)?.[1];
        if (!dataset || !spatialomicsFiles.has(dataset) || url.search !== '?page_size=1000') {
            throw new Error(`Unrecorded spatialomics file request: ${url.pathname}${url.search}`);
        }
        return structuredClone(spatialomicsFiles.get(dataset));
    }
    if (url.origin === 'https://www.ebi.ac.uk' && url.pathname === '/biostudies/api/v1/studies/S-BIAD1093/info') return saved('file-links-s-biad1093');
    if (url.origin !== 'https://alpha.bioimagearchive.org' || accession !== 'S-BIAD1093') return undefined;
    if (url.pathname === '/search/v1/website/study') return saved('study-s-biad1093');
    if (url.pathname === '/search/v1/website/image' && url.searchParams.get('pagination.page') === '1' &&
        url.searchParams.get('pagination.page_size') === '100') return saved('images-s-biad1093');
    if (url.pathname === '/search/v1/website/browse/image') {
        if (url.searchParams.get('has.specimen_track_display_image') === 'false' &&
            url.searchParams.get('pagination.page_size') === '1') return saved('image-tracks-s-biad1093');
        const response = saved('images-s-biad1093');
        const page = Number(url.searchParams.get('pagination.page') ?? 1);
        const size = Number(url.searchParams.get('pagination.page_size') ?? 10);
        response.hits.hits = response.hits.hits.slice((page - 1) * size, page * size);
        response.pagination = { page, page_size: size, total_pages: Math.ceil(response.hits.total.value / size), total_results: response.hits.total.value };
        return response;
    }
    throw new Error(`Unrecorded spatialomics request: ${url.pathname}${url.search}`);
}
