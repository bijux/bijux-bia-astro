import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDatasetNames, loadAnnotationStudies } from '../../../src/features/galleries/ai/benchmarking/load-studies.mjs';

import { formatRowAnalysisParameters } from '../../../src/features/galleries/ai/benchmarking/analysis-parameters.mjs';

test('benchmarking resolves each study once, preserves dataset order and fails on missing studies', async () => {
    const calls = [], rows = Object.freeze([{ study: 'a' }, { study: 'b' }, { study: 'a' }]);
    const names = await loadDatasetNames(rows, { getStudyFromApiByAccession: async id => {
        calls.push(id); return { dataset: [{ uuid: id, title: id + ' title' }] };
    } });
    assert.deepEqual(calls, ['a', 'b']); assert.deepEqual([...names], [['a', 'a title'], ['b', 'b title']]);
    await assert.rejects(loadDatasetNames(rows, { getStudyFromApiByAccession: async () => undefined }), /unavailable/);
});

test('analysis parameters retain escaped authored order, zero and false', () => {
    assert.equal(formatRowAnalysisParameters({ '<script>': '<value>', zero: 0, flag: false, absent: null }), '&lt;script&gt;: &lt;value&gt;<br/>zero: 0<br/>flag: false<br/>');
});

test('foreign annotation studies resolve once without replacing the current study', async () => {
    const study = { accession_id: 'a' }, related = { accession_id: 'b' }, calls = [];
    const datasets = [{ annotation_study: 'a' }, { annotation_study: 'b' }, { annotation_study: 'b' }, {}];
    const result = await loadAnnotationStudies(study, datasets, { getStudyFromApiByAccession: async accession => { calls.push(accession); return related; } });
    assert.equal(result.a, study); assert.equal(result.b, related); assert.deepEqual(calls, ['b']);
    await assert.rejects(loadAnnotationStudies(study, datasets, { getStudyFromApiByAccession: async () => undefined }), /Annotation study b is unavailable/);
});
