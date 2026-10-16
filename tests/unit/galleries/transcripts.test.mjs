import assert from 'node:assert/strict';
import test from 'node:test';
import { studyHasTranscripts } from '../../../src/features/galleries/spatialomics/load-transcripts.mjs';

test('transcript detection retains early exit and rejects unavailable or malformed file metadata', async () => {
    const calls = [];
    assert.equal(await studyHasTranscripts(['first', 'second', 'unused'], 'https://example.org', async url => {
        calls.push(new URL(url).pathname);
        return calls.length === 1 ? [{ additional_metadata: null }] : [{ additional_metadata: [{ name: 'attributes_from_biostudies.File', value: { attributes: { Data_Type: 'transcripts' } } }] }];
    }), true);
    assert.deepEqual(calls, ['/dataset/first/file_reference', '/dataset/second/file_reference']);
    assert.equal(await studyHasTranscripts([], '', () => { throw new Error('unused'); }), false);
    for (const value of [null, {}, [null], [{ additional_metadata: {} }], [{ additional_metadata: [null] }]]) {
        await assert.rejects(studyHasTranscripts(['first'], 'https://example.org', async () => value), /Invalid file references/);
    }
    const failure = new Error('Controlled service failure');
    await assert.rejects(studyHasTranscripts(['first'], 'https://example.org', async () => { throw failure; }), error => error === failure);
});
