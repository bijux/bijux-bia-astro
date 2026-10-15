import assert from 'node:assert/strict';
import test from 'node:test';
import { groupSourceAnnotations, selectAnnotationImages } from '../../../src/features/galleries/ai/annotations.mjs';

test('annotation grouping retains source/annotation order, skips excluded records and does not invent orphan groups', async () => {
    const image = (uuid, inputs = [], metadata = []) => Object.freeze({ uuid, representation: [{ image_format: '.ome.zarr' }], creation_process: { input_image_uuid: inputs }, additional_metadata: metadata });
    const source = image('source');
    const first = image('first', ['source']), second = image('second', ['source']);
    const images = Object.freeze([first, image('orphan', ['missing']), source, second, image('2a382f3a-aa6d-4ace-99fb-468335fa3809'), image('excluded-child', ['2a382f3a-aa6d-4ace-99fb-468335fa3809'])]);
    const groups = groupSourceAnnotations(images);
    assert.deepEqual([...groups.keys()], ['source']);
    assert.equal(groups.get('source').sourceImage, source);
    assert.deepEqual(groups.get('source').annotationImages, [first, second]);
});

test('derived selection retains annotations while excluding the source and documented raw/preview images', () => {
    const image = { uuid: 'annotation', representation: [{ image_format: '.ome.zarr' }], creation_process: { input_image_uuid: ['source'] } };
    const excludedDescriptions = ['Raw image in JPEG format', 'Visualization of groundtruth masks in PNG format', 'Visualization of groundtruth for randomly selected nuclei in PNG format'];
    const candidates = [
        { ...image, uuid: 'source' }, image,
        { ...image, creation_process: {} },
        { ...image, representation: [{ image_format: '.tif' }] },
        ...excludedDescriptions.map(description => ({ ...image, additional_metadata: [{ value: { attributes: { 'file description': description } } }] })),
    ];
    assert.deepEqual(selectAnnotationImages(candidates, 'source'), [image]);
    assert.equal(selectAnnotationImages(candidates, 'source')[0], image);
});
