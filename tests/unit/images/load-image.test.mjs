import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadImagePage } from '../../../src/features/images/load-image.ts';
import { createSearchClient } from '../../../src/api/search.mjs';
import { createRequestJSON } from '../../../src/api/http.mjs';

const capture = async name => JSON.parse(await readFile(new URL(`../../fixtures/api/${name}-response.json`, import.meta.url))).hits.hits[0]._source;
const capturedImage = await capture('image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39');
const study = await capture('study-empiar12104');

function fixture(primary, related = [], selectedStudy = study) {
    const calls = new Map();
    const images = [primary, ...related].filter(Boolean);
    const client = createSearchClient('https://example.org/v1', createRequestJSON({ request: async value => {
        const url = new URL(value); calls.set(value, (calls.get(value) ?? 0) + 1);
        if (url.pathname.endsWith('/study')) return { hits: { hits: selectedStudy ? [{ _source: selectedStudy }] : [] } };
        if (url.searchParams.has('facet.downstream_of')) return { hits: { hits: related.map(_source => ({ _source })) } };
        const image = images.find(image => image.uuid === url.searchParams.get('query'));
        return { hits: { hits: image ? [{ _source: image }] : [] } };
    } }));
    return { client, calls };
}

test('image loading preserves references, relation ordering, inherited specimens and request-scoped deduplication', async () => {
    const firstUUID = '00000000-0000-4000-8000-000000000002';
    const secondUUID = '00000000-0000-4000-8000-000000000003';
    const specimen = Object.freeze({ uuid: 'specimen', sample_of: [] });
    const first = Object.freeze({ ...capturedImage, uuid: firstUUID, upstream_image_uuids: [], creation_process: { subject: specimen } });
    const second = Object.freeze({ ...capturedImage, uuid: secondUUID });
    const image = Object.freeze({ ...capturedImage, specimen_track_position: 'terminal', creation_process: { input_image_uuid: [firstUUID, firstUUID] }, upstream_image_uuids: [firstUUID, secondUUID], segmentation_image_uuids: [secondUUID] });
    const { client, calls } = fixture(image, [first, second]);
    const view = await loadImagePage(image.uuid, client);
    assert.equal(view.image, image); assert.equal(view.study, study);
    assert.equal(view.dataset, study.dataset.find(dataset => dataset.uuid === image.submission_dataset_uuid));
    assert.deepEqual(view.inputImages, [first, first]);
    assert.deepEqual(view.upstreamImages, [first, second]);
    assert.deepEqual(view.segmentationImages, [second]);
    assert.deepEqual(view.inheritedSpecimens, [specimen]);
    assert.equal(view.hasSpecimenTracks, true);
    assert.equal(calls.size, 4); // Primary image, study and two unique related images.
    assert([...calls.values()].every(count => count === 1));
});

test('absent primary images stay absent while required study/relation failures are explicit', async () => {
    const uuid = capturedImage.uuid;
    const absent = fixture(null);
    assert.equal(await loadImagePage(uuid, absent.client), null);
    assert.equal(absent.calls.size, 1);
    for (const [fields, message] of [[{ accession_id: null }, /study accession/], [{ licence_details: null }, /licence metadata/]]) {
        await assert.rejects(loadImagePage(uuid, fixture({ ...capturedImage, ...fields }).client), message);
    }
    await assert.rejects(loadImagePage(uuid, fixture(capturedImage, [], null).client), /unavailable study/);
    const missing = { ...capturedImage, upstream_image_uuids: ['00000000-0000-4000-8000-000000000009'] };
    await assert.rejects(loadImagePage(uuid, fixture(missing).client), /Missing upstream image/);
    const failure = new Error('Controlled upstream failure');
    await assert.rejects(loadImagePage(uuid, { getImageFromAPI: async () => { throw failure; } }), error => error === failure);
});

test('own specimens take precedence and only internal images request terminal descendants', async () => {
    const subject = { uuid: 'own-specimen' };
    for (const position of ['internal', 'terminal', 'segmentation']) {
        const image = { ...capturedImage, specimen_track_position: position, creation_process: { subject }, upstream_image_uuids: [], segmentation_image_uuids: [] };
        const { client, calls } = fixture(image);
        const view = await loadImagePage(image.uuid, client);
        assert.equal(view.specimen, subject);
        assert.deepEqual(view.inheritedSpecimens, []);
        assert.equal(view.hasSpecimenTracks, false);
        assert.equal([...calls.keys()].some(value => value.includes('facet.downstream_of')), position === 'internal');
    }
});
