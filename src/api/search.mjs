import { fetchJSON, boundedMap } from './http.mjs';
import { hitRecords, selectedEntity, cataloguePage, imageRecord, imageCount } from './contracts.mjs';

/** Endpoint-specific validation over the shared bounded HTTP transport. No presentation imports. */
export function createSearchClient(baseURL, requestJSON = fetchJSON) {
    const origin = new URL(baseURL);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) throw new TypeError('Invalid search API origin.');
    baseURL = baseURL.replace(/\/$/, '');
    const getFromAPI = requestJSON;
    async function getStudyFromApiByAccession(accessionID) {
        const value = await getFromAPI(`${baseURL}/website/study?facet.accession_id=${encodeURIComponent(accessionID)}`);
        const study = selectedEntity(value, 'accession_id', accessionID);
        if (study && !Array.isArray(study.dataset)) throw new TypeError('Invalid study datasets.');
        return study;
    }
    async function getImageFromAPI(uuid) {
        if (typeof uuid !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uuid)) return null;
        const value = await getFromAPI(`${baseURL}/website/image?query=${encodeURIComponent(uuid)}`);
        const matches = hitRecords(value).filter(hit => typeof hit._source.uuid === 'string' && hit._source.uuid.toLowerCase() === uuid.toLowerCase());
        if (matches.length > 1) throw new TypeError('Ambiguous image response.');
        return matches.length ? imageRecord(matches[0]._source) : null;
    }
    const getImagesFromAPI = uuidList => boundedMap(uuidList, getImageFromAPI);
    async function getDownstreamDisplayImages(uuid) {
        return hitRecords(await getFromAPI(`${baseURL}/website/image?facet.downstream_of=${encodeURIComponent(uuid)}&facet.specimen_track_position=terminal`)).map(hit => imageRecord(hit._source));
    }
    async function studyHasSpecimenTracks(accessionID) {
        return imageCount(await getFromAPI(`${baseURL}/website/browse/image?facet.accession_id=${encodeURIComponent(accessionID)}&has.specimen_track_display_image=false&pagination.page_size=1`)) > 0;
    }
    async function allHits(urlBuilder, pageSize = 100) {
        const first = cataloguePage(await getFromAPI(urlBuilder(1, pageSize)), 1, pageSize);
        const other = await boundedMap(Array.from({ length: Math.max(0, first.pages - 1) }, (_, index) => index + 2), async page => {
            const value = cataloguePage(await getFromAPI(urlBuilder(page, pageSize)), page, pageSize, first.total);
            if (value.pages !== first.pages) throw new TypeError('Catalogue page count changed during retrieval.');
            return value.hits;
        });
        const hits = [...first.hits, ...other.flat()];
        const identifiers = hits.map(hit => hit._source.uuid ?? hit._id);
        if (hits.length !== first.total || identifiers.some(id => typeof id !== 'string' || !id) || new Set(identifiers).size !== identifiers.length) throw new TypeError('Catalogue pages are incomplete, duplicated or changed during retrieval.');
        return hits;
    }
    async function getImagesByAccessionID(accessionID) {
        return (await allHits((page, size) => `${baseURL}/website/image?facet.accession_id=${encodeURIComponent(accessionID)}&pagination.page_size=${size}&pagination.page=${page}`)).map(hit => imageRecord(hit._source));
    }
    async function getAllStudiesFromAPI() {
        const studies = (await allHits((page, size) => `${baseURL}/website/browse/study?pagination.page_size=${size}&pagination.page=${page}`)).map(hit => hit._source);
        if (studies.some(study => typeof study.accession_id !== 'string' || !/^[a-z\d][a-z\d._-]{0,127}$/i.test(study.accession_id))) throw new TypeError('Catalogue supplied an invalid study route identifier.');
        if (new Set(studies.map(study => study.accession_id)).size !== studies.length) throw new TypeError('Catalogue supplied duplicate study routes.');
        return studies;
    }
    function isImageAnAnnotation(image) {
        return Boolean(image.creation_process?.input_image_uuid?.length && image.representation.some(item => item.image_format === '.ome.zarr') && !image.additional_metadata?.some(metadata => [
            'Raw image in JPEG format', 'Visualization of groundtruth masks in PNG format', 'Visualization of groundtruth for randomly selected nuclei in PNG format',
        ].includes(metadata.value?.attributes?.['file description'])));
    }
    async function getAnnotationFromDerivedImages(uuid) {
        return hitRecords(await getFromAPI(`${baseURL}/website/image?query=${encodeURIComponent(uuid)}&includeDerivedImages=true`)).map(hit => imageRecord(hit._source)).filter(image => image.uuid !== uuid && isImageAnAnnotation(image));
    }
    async function generateSourceAnnotatedImageMap(accessionID) {
        const images = await getImagesByAccessionID(accessionID);
        const excluded = new Set(['2a382f3a-aa6d-4ace-99fb-468335fa3809', '8921dcfb-4f5b-4ac1-a390-04b3ef2155ea', 'd0b3f24f-4a9c-499b-99e4-343de48e7c82']);
        const sources = new Map(images.filter(image => !isImageAnAnnotation(image) && !excluded.has(image.uuid)).map(image => [image.uuid, image]));
        const groups = new Map();
        for (const image of images.filter(isImageAnAnnotation)) {
            const source = image.creation_process.input_image_uuid[0];
            if (!sources.has(source)) continue;
            if (!groups.has(source)) groups.set(source, { sourceImage: sources.get(source), annotationImages: [] });
            groups.get(source).annotationImages.push(image);
        }
        return groups;
    }
    return { getFromAPI, getStudyFromApiByAccession, getImageFromAPI, getImagesFromAPI, getDownstreamDisplayImages, studyHasSpecimenTracks, getImagesByAccessionID, getAllStudiesFromAPI, getAnnotationFromDerivedImages, generateSourceAnnotatedImageMap };
}
