import { relationshipImage, relationshipImages } from '../scenarios/image-relationships.mjs';
import { readFileSync } from 'node:fs';
import { cursorSearchResponse } from '../scenarios/search-pagination.mjs';
import { benchmarkStudies } from '../scenarios/benchmark-datasets.mjs';
import { annotationStudy, sourceImage, annotationImages } from '../scenarios/annotations.mjs';
import { uncuratedImage, curatedImage } from '../scenarios/image-representations.mjs';
import { imageWithFileMetadata, imageWithoutViewer } from '../scenarios/image-file-metadata.mjs';

const saved = name => JSON.parse(readFileSync(new URL(`../api/${name}-response.json`, import.meta.url)));
const studies = ['study-s-biad3335', 'study-empiar12104'].map(name => saved(name).hits.hits[0]._source);
const image = saved('image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39').hits.hits[0]._source;

/** Complete captured metadata with deliberately small, synthetic browse/pagination results. */
export function fixtureResponse(value) {
    const url = new URL(value);
    if (url.searchParams.get('query') === 'unavailable') throw new Error('Controlled API failure.');
    if (url.origin === 'https://www.ebi.ac.uk' && url.pathname === '/biostudies/api/v1/studies/S-BIAD3335/info') return { httpLink: 'https://www.ebi.ac.uk/biostudies/files/S-BIAD3335/' };
    // Synthetic optional enrichment exercises unit text absent from the saved study captures.
    if (url.origin === 'https://www.ebi.ac.uk' && url.pathname === '/emdb/api/entry/EMD-1234') return {
        structure_determination_list: { structure_determination: { image_processing: {
            final_reconstruction: { resolution: { valueOf_: '3.25', units: 'Å' } },
        } } },
    };
    if (url.origin === 'https://www.ebi.ac.uk' && ['/ebisearch/ws/rest/ebiweb_training_events', '/ebisearch/ws/rest/ebiweb_training_online'].includes(url.pathname)) return { entries: [] };
    if (url.origin !== 'https://alpha.bioimagearchive.org') throw new Error(`Unrecorded fixture origin: ${url.origin}`);
    if (url.pathname === '/search/v1/website/image') {
        const related = relationshipImages.find(image => image.uuid === url.searchParams.get('query'));
        if (related) return { hits: { hits: [{ _source: related }] } };
        if (relationshipImages.some(image => image.uuid === url.searchParams.get('facet.downstream_of')) &&
            url.searchParams.get('facet.specimen_track_position') === 'terminal') {
            return { hits: { hits: relationshipImage.upstream_image_uuids.includes(url.searchParams.get('facet.downstream_of'))
                ? [{ _source: relationshipImage }] : [] } };
        }
    }
    const representationImage = [uncuratedImage, curatedImage, imageWithFileMetadata, imageWithoutViewer].find(image => image.uuid === url.searchParams.get('query'));
    if (url.pathname === '/search/v1/website/image' && representationImage) {
        return { hits: { hits: [{ _source: representationImage }] } };
    }
    if (url.pathname === '/search/v1/website/image' && url.searchParams.get('query') === sourceImage.uuid) {
        const images = url.searchParams.get('includeDerivedImages') === 'true' ? [sourceImage, ...annotationImages] : [sourceImage];
        return { hits: { hits: images.map(_source => ({ _source })) } };
    }
    if (url.pathname === '/search/v1/website/study') {
        const accession = url.searchParams.get('facet.accession_id');
        const study = [...studies, annotationStudy].find(item => item.accession_id === accession) ?? benchmarkStudies.get(accession);
        if (study) return { hits: { hits: [{ _source: accession === 'S-BIAD3335'
            ? { ...study, see_also: [...(study.see_also ?? []), { link_type: 'EMDB', link: 'https://www.ebi.ac.uk/emdb/EMD-1234' }] }
            : study }] } };
    }
    // Explicit synthetic boundary: this representative internal image has no returned terminal descendants.
    if (url.pathname === '/search/v1/website/image' && url.searchParams.get('facet.downstream_of') === image.uuid && url.searchParams.get('facet.specimen_track_position') === 'terminal') return { hits: { hits: [] } };
    if (url.pathname === '/search/v1/website/image' && url.searchParams.get('query') === image.uuid) return { hits: { hits: [{ _source: image }] } };
    if (url.pathname === '/search/v1/website/browse/study' && url.searchParams.get('pagination.page_size') === '100') return {
        hits: { total: { value: studies.length, relation: 'eq' }, hits: studies.map(_source => ({ _source })) },
        pagination: { page: 1, total_pages: 1 },
    };
    if (['/search/v1/website/browse/image', '/search/v1/website/browse/study'].includes(url.pathname)) {
        const isImage = url.pathname.endsWith('image');
        if (isImage && url.searchParams.get('query') === 'cursor-example') return cursorSearchResponse(saved('browse-image'), url);
        const response = saved(isImage ? 'browse-image' : 'browse-study');
        if (isImage && url.searchParams.get('query') === 'representation-boundary') {
            response.hits.hits = response.hits.hits.slice(0, 1);
            response.hits.hits[0]._source.representation = structuredClone(uncuratedImage.representation);
            response.hits.hits[0]._source.additional_metadata = [];
        }
        if (isImage && url.searchParams.get('query') === 'recommended-representation') {
            response.hits.hits = response.hits.hits.slice(0, 1);
            response.hits.hits[0]._source.representation = structuredClone(curatedImage.representation);
            response.hits.hits[0]._source.additional_metadata = [{ name: 'recommended_vizarr_representation',
                value: { recommended_vizarr_representation: curatedImage.representation[1].uuid } }];
        }
        // Synthetic partial labels reproduce a classification-loss case absent from the captures.
        if (!isImage && url.searchParams.get('query') === 'taxon-example') {
            response.hits.hits = response.hits.hits.slice(0, 1);
            response.hits.hits[0]._source.organism_classification = [
                { scientific_name: 'Mus musculus' }, { scientific_name: 'Homo sapiens' },
            ];
            response.hits.hits[0].highlight = {};
        }
        if (['empty-additional-highlights', 'match-example'].includes(url.searchParams.get('query'))) {
            const highlight = url.searchParams.get('query') === 'match-example'
                ? { description: ['__HIT__Cell__/HIT__ & nucleus'], 'author.name': ['<script>literal text</script>'] }
                : { title: ['Primary title'], description: [], 'author.name': null };
            response.hits.hits = response.hits.hits.slice(0, 1).map(hit => ({ ...hit, highlight }));
        }
        if (url.searchParams.get('query') === 'empty-highlights') {
            response.hits.hits = response.hits.hits.slice(0, 1).map(hit => ({ ...hit, highlight: {} }));
        }
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
