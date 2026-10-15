import { PUBLIC_SEARCH_API } from 'astro:env/client';
import { createSearchClient } from './search.mjs';

export const {
    getFromAPI, getStudyFromApiByAccession, getImageFromAPI, getImagesFromAPI,
    getDownstreamDisplayImages, studyHasSpecimenTracks, getImagesByAccessionID,
    getAllStudiesFromAPI, getAnnotationFromDerivedImages, generateSourceAnnotatedImageMap,
} = createSearchClient(PUBLIC_SEARCH_API);
