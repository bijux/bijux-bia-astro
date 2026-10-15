import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAnnotationType, getDatasetStatsByUUID, getMetadataValue, getSimpleAttributeValue } from '../../../src/features/metadata/records.mjs';

test('metadata summaries retain record order and meaningful zero/false values without mutation', () => {
    const study = { dataset: [{ uuid: 'first', file_reference_count: 0, title: 'First' }, { uuid: 'second', file_reference_count: 2, title: 'Second' }], additional_metadata: [{ name: 'count', value: { count: 0 } }, { name: 'enabled', value: { enabled: false } }] };
    const before = structuredClone(study);
    assert.deepEqual(getDatasetStatsByUUID(study), [['first', 0, 'First'], ['second', 2, 'Second']]);
    assert.equal(getSimpleAttributeValue(study, 'count'), 0);
    assert.equal(getSimpleAttributeValue(study, 'enabled'), false);
    assert.equal(getMetadataValue(study.additional_metadata, 'enabled').enabled, false);
    assert.equal(getSimpleAttributeValue(study, 'missing'), null);
    assert.deepEqual(study, before);
});

test('annotation categories combine legacy nested metadata and protocol terms once in display order', () => {
    const datasets = [{ additional_metadata: [{ name: 'annotation_type', value: { annotation_type: [[' Cell_Boundary '], 'POINT'] } }], annotation_process: [{ method_type: ['point', 'Weak_Labels'] }] }];
    const before = structuredClone(datasets);
    assert.deepEqual(getAnnotationType(datasets), ['cell boundary', 'point', 'weak labels']);
    assert.deepEqual(getAnnotationType([]), []);
    assert.deepEqual(datasets, before);
});
