import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSearchClient } from '../../src/api/search.mjs';

test('catalogue HTTP pagination preserves order and rejects changing totals, missing pages and duplicate identities', async t => {
    let mode = 'complete';
    const server = createServer((request, response) => {
        const page = Number(new URL(request.url, 'http://localhost').searchParams.get('pagination.page'));
        const id = page === 2 && mode !== 'duplicate' ? 2 : 1;
        const data = { hits: { hits: page === 2 && mode === 'missing' ? [] : [{ _source: { uuid: `study-${id}`, accession_id: `S-BIAD${id}` } }], total: { value: page === 2 && mode === 'changed' ? 3 : 2, relation: 'eq' } }, pagination: { page, total_pages: 2 } };
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const client = createSearchClient(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual((await client.getAllStudiesFromAPI()).map(study => study.accession_id), ['S-BIAD1', 'S-BIAD2']);
    for (mode of ['changed', 'missing', 'duplicate']) await assert.rejects(client.getAllStudiesFromAPI(), /catalogue/i);
});

test('entity responses preserve identity and absence while rejecting malformed or ambiguous records', async () => {
    const uuid = '001b8ef2-7a5e-4b94-b91c-d93f5095ee39';
    const image = Object.freeze({ uuid, representation: Object.freeze([]) });
    const study = Object.freeze({ accession_id: 'S-BIAD1', dataset: Object.freeze([]) });
    let value = { hits: { hits: [{ _source: image }] } }, calls = 0;
    const client = createSearchClient('https://example.org/v1', async () => { calls++; return value; });
    assert.equal(await client.getImageFromAPI(uuid.toUpperCase()), image);
    assert.equal(await client.getImageFromAPI('invalid'), null);
    assert.equal(calls, 1);
    value = { hits: { hits: [{ _source: study }] } };
    assert.equal(await client.getStudyFromApiByAccession('S-BIAD1'), study);
    value = { hits: { hits: [] } };
    assert.equal(await client.getStudyFromApiByAccession('S-BIAD1'), undefined);
    assert.equal(await client.getImageFromAPI(uuid), null);
    for (value of [{}, { hits: { hits: [null] } }, { hits: { hits: [{ _source: image }, { _source: image }] } }]) await assert.rejects(client.getImageFromAPI(uuid), TypeError);
    value = { hits: { total: { value: -1 } } };
    await assert.rejects(client.studyHasSpecimenTracks('S-BIAD1'), /count/);
});

test('annotation grouping retains source/annotation order, skips excluded records and does not invent orphan groups', async () => {
    const image = (uuid, inputs = [], metadata = []) => Object.freeze({ uuid, representation: [{ image_format: '.ome.zarr' }], creation_process: { input_image_uuid: inputs }, additional_metadata: metadata });
    const source = image('source');
    const first = image('first', ['source']), second = image('second', ['source']);
    const images = Object.freeze([first, image('orphan', ['missing']), source, second, image('2a382f3a-aa6d-4ace-99fb-468335fa3809'), image('excluded-child', ['2a382f3a-aa6d-4ace-99fb-468335fa3809'])]);
    const client = createSearchClient('https://example.org/v1', async () => ({ hits: { hits: images.map(_source => ({ _source })), total: { value: images.length } }, pagination: { page: 1, total_pages: 1 } }));
    const groups = await client.generateSourceAnnotatedImageMap('S-BIAD1');
    assert.deepEqual([...groups.keys()], ['source']);
    assert.equal(groups.get('source').sourceImage, source);
    assert.deepEqual(groups.get('source').annotationImages, [first, second]);
});
