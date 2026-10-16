import assert from 'node:assert/strict';
import test from 'node:test';
import { transcriptFiles } from '../../../src/features/galleries/spatialomics/transcript-records.mjs';

const file = attributes => ({ additional_metadata: [{ name: 'attributes_from_biostudies.File', value: { attributes } }] });
test('transcript selection preserves supported markers, legacy descriptions, record identity and ordering', () => {
    const selected = [file({ Data_Type: 'transcripts', Description: 0 }), file({ Data_Type: 'Transcript_Coordinates' }),
        file({ Description: 'Feature barcode data' }), file({ Description: 'Sparse feature matrix data' }), file({ Description: ['feature matrix'] })];
    const files = [{}, ...selected, file({ Description: 17 }), file({ Description: ['other feature matrix text'] }),
        { additional_metadata: null }, { additional_metadata: [{ name: 'another source', value: { attributes: { Data_Type: 'transcripts' } } }] }];
    const before = structuredClone(files);
    const result = transcriptFiles(files, 'dataset');
    assert.deepEqual(result, selected);
    result.forEach((record, index) => assert.equal(record, selected[index]));
    assert.deepEqual(files, before);
});

test('empty lists remain valid while malformed or over-limit responses identify the dataset', () => {
    assert.deepEqual(transcriptFiles([], 'dataset'), []);
    assert.equal(transcriptFiles(Array(1000).fill(file({ Data_Type: 'transcripts' })), 'dataset').length, 1000);
    for (const value of [null, {}, [null], [[]], [{ additional_metadata: {} }], [{ additional_metadata: [null] }], Array(1001).fill({})]) {
        assert.throws(() => transcriptFiles(value, 'example-uuid'), { name: 'TypeError', message: 'Invalid transcript file metadata for dataset example-uuid.' });
    }
});
