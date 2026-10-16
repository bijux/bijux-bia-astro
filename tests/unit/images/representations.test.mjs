import assert from 'node:assert/strict';
import test from 'node:test';
import { findImageRepresentation, selectInteractiveRepresentation } from '../../../src/features/images/representations.mjs';

test('missing recommendations skip missing UUIDs and retain the first OME-Zarr fallback', () => {
    const image = Object.freeze({ representation: Object.freeze([
        Object.freeze({ image_format: '.tif' }),
        Object.freeze({ uuid: 'first-zarr', image_format: '.ome.zarr' }),
        Object.freeze({ uuid: 'second-zarr', image_format: '.ome.zarr' }),
    ]) });
    assert.equal(selectInteractiveRepresentation(image), image.representation[1]);
    for (const uuid of [null, undefined, '', 0, 'unknown']) {
        assert.equal(findImageRepresentation(image, uuid), undefined);
        assert.equal(selectInteractiveRepresentation(image, uuid), image.representation[1]);
    }
});

test('wrapped recommendations and explicit curation overrides retain the selected record', () => {
    const image = Object.freeze({ representation: Object.freeze([
        Object.freeze({ uuid: 'fallback', image_format: '.ome.zarr' }),
        Object.freeze({ uuid: 'recommended', image_format: '.tif' }),
    ]), additional_metadata: Object.freeze([Object.freeze({ name: 'recommended_vizarr_representation',
        value: Object.freeze({ recommended_vizarr_representation: 'recommended' }) })]) });
    assert.equal(selectInteractiveRepresentation(image), image.representation[1]);
    assert.equal(selectInteractiveRepresentation(image, 'fallback'), image.representation[0]);
    assert.equal(findImageRepresentation(image, 'recommended'), image.representation[1]);
});

test('summaries without a usable representation leave viewer selection absent', () => {
    for (const image of [undefined, {}, { representation: null }, { representation: [] },
        { representation: [{ uuid: 'tiff', image_format: '.tif' }] }]) {
        assert.equal(selectInteractiveRepresentation(image), undefined);
    }
});
