import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getTrainingEntries } from '../../../src/api/training.mjs';

const provenance = JSON.parse(await readFile(new URL('../../fixtures/api/provenance.json', import.meta.url)));
test('fixed training endpoints preserve captured fields with bounded transport and caller cancellation', async () => {
    for (const [kind, file] of [['live', 'training-live-response.json'], ['ondemand', 'training-on-demand-response.json']]) {
        const capture = provenance.responses.find(entry => entry.file === file);
        const response = JSON.parse(await readFile(new URL(`../../fixtures/api/${file}`, import.meta.url)));
        const before = structuredClone(response), signal = new AbortController().signal;
        let calls = 0;
        const entries = await getTrainingEntries(kind, { signal, request: async (url, options) => {
            calls++; assert.equal(url, capture.url);
            assert.equal(options.maxBytes, 1024 * 1024); assert.equal(options.signal, signal); return response;
        } });
        assert.equal(calls, 1);
        assert.deepEqual(entries, response.entries);
        entries.forEach((entry, index) => assert.equal(entry, response.entries[index]));
        assert.deepEqual(response, before);
    }
});

test('legacy lists and optional scalar/list fields preserve order without validating unrendered cards', async () => {
    const first = { fields: { title: 'First', description: null, url: [] } };
    const second = { fields: { title: ['Second'], status: ['Open'], venue: 'null', subtitle: [] } };
    const entries = [first, second, { unused: 'not rendered' }], before = structuredClone(entries);
    const selected = await getTrainingEntries('live', { request: async () => entries });
    assert.deepEqual(selected, [first, second]); assert.equal(selected[0], first);
    assert.deepEqual(entries, before);
    assert.deepEqual(await getTrainingEntries('ondemand', { request: async () => [] }), []);
});

test('unavailable, malformed or unnamed training cards fail without inventing successful empty results', async () => {
    await assert.rejects(getTrainingEntries('__proto__', { request: () => assert.fail('Invalid category reached the network') }), /Invalid training category/);
    for (const response of [null, {}, { entries: null }, { entries: {} }, [null], [{ fields: [] }], [{ fields: {} }],
        [{ fields: { title: [] } }], [{ fields: { title: ' ' } }], [{ fields: { title: 'Valid', description: {} } }],
        [{ fields: { title: ['Valid', 1] } }]]) {
        await assert.rejects(getTrainingEntries('live', { request: async () => response }), TypeError);
    }
    const error = new Error('Controlled training failure');
    await assert.rejects(getTrainingEntries('ondemand', { request: async () => { throw error; } }), value => value === error);
});
