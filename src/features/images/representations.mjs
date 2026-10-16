import { getSimpleAttributeValue } from '../metadata/records.mjs';

const representations = image => Array.isArray(image?.representation) ? image.representation : [];

/** An absent recommendation must never match an absent representation UUID. */
export function findImageRepresentation(image, uuid) {
    return typeof uuid === 'string' && uuid !== ''
        ? representations(image).find(representation => representation?.uuid === uuid)
        : undefined;
}

/** Honour a supplied recommendation, otherwise use the first OME-Zarr in authored order. */
export function selectInteractiveRepresentation(image,
    preferredUuid = getSimpleAttributeValue(image, 'recommended_vizarr_representation')) {
    return findImageRepresentation(image, preferredUuid) ??
        representations(image).find(representation => representation?.image_format === '.ome.zarr');
}
