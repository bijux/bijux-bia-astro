import { readFileSync } from 'node:fs';

const saved = name => JSON.parse(readFileSync(new URL(`../api/${name}-response.json`, import.meta.url)));
const studies = ['study-s-biad3335', 'study-empiar12104'].map(name => saved(name).hits.hits[0]._source);
const image = saved('image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39').hits.hits[0]._source;

/** Complete captured metadata with deliberately small, synthetic browse/pagination results. */
export function fixtureResponse(value) {
    const url = new URL(value);
    if (url.origin === 'https://www.ebi.ac.uk' && url.pathname === '/biostudies/api/v1/studies/S-BIAD3335/info') return { httpLink: 'https://www.ebi.ac.uk/biostudies/files/S-BIAD3335/' };
    if (url.origin !== 'https://alpha.bioimagearchive.org') throw new Error(`Unrecorded fixture origin: ${url.origin}`);
    if (url.pathname === '/search/v1/website/study') {
        const study = studies.find(item => item.accession_id === url.searchParams.get('facet.accession_id'));
        if (study) return { hits: { hits: [{ _source: study }] } };
    }
    if (url.pathname === '/search/v1/website/image' && url.searchParams.get('query') === image.uuid) return { hits: { hits: [{ _source: image }] } };
    if (url.pathname === '/search/v1/website/browse/study' && url.searchParams.get('pagination.page_size') === '100') return {
        hits: { total: { value: studies.length, relation: 'eq' }, hits: studies.map(_source => ({ _source })) },
        pagination: { page: 1, total_pages: 1 },
    };
    if (['/search/v1/website/browse/image', '/search/v1/website/browse/study'].includes(url.pathname)) {
        const isImage = url.pathname.endsWith('image');
        const response = saved(isImage ? 'browse-image' : 'browse-study');
        const page = Number(url.searchParams.get('pagination.page') ?? 1);
        const size = Number(url.searchParams.get('pagination.page_size') ?? 12);
        if (isImage && url.searchParams.get('facet.accession_id') === 'EMPIAR-12104') {
            const count = url.searchParams.get('has.specimen_track_display_image') === 'true' ? 14 : 30;
            const images = Array.from({ length: count }, (_, index) => ({ _source: { ...image, uuid: image.uuid.slice(0, -8) + index.toString(16).padStart(8, '0') } }));
            response.hits = { total: { value: count, relation: 'eq' }, hits: images.slice((page - 1) * size, page * size) };
        } else response.hits.total = { value: response.hits.hits.length, relation: 'eq' };
        response.pagination = { page, page_size: size, total_pages: Math.ceil(response.hits.total.value / size), total_results: response.hits.total.value };
        return response;
    }
    throw new Error(`Unrecorded fixture request: ${url.pathname}${url.search}`);
}
