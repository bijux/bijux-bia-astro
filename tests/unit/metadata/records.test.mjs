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

test('optional metadata accepts missing containers and null entries without losing zero or false', () => {
    for (const additional_metadata of [undefined, null, {}, [null], [{ name: 'summary', value: null }]]) {
        assert.equal(getSimpleAttributeValue({ additional_metadata }, 'summary'), null);
        assert.equal(getMetadataValue(additional_metadata, 'absent'), undefined);
    }
    const metadata = [null, { name: 'zero', value: 0 }, { name: 'flag', value: false },
        { name: 'ids', value: { id: ['first', 'second'] } }];
    assert.equal(getMetadataValue(metadata, 'zero'), 0);
    assert.equal(getMetadataValue(metadata, 'flag'), false);
    assert.equal(getMetadataValue(metadata, 'ids', 'id'), 'first');
});

test('annotation labels retain legacy wrapped/scalar values and skip incomplete optional records', () => {
    const datasets = [null, {}, { additional_metadata: [null, { name: 'annotation_type', value: ' Cell_Boundary,POINT ' }] },
        { additional_metadata: [{ name: 'annotation_type', value: { annotation_type: 'Weak_Labels' } }] },
        { additional_metadata: [{ name: 'annotation_type', value: { annotation_type: [['POINT', null, ' '], 'Polygon'] } }],
          annotation_process: [null, { method_type: ['expert_annotated', null] }] }];
    const before = structuredClone(datasets);
    assert.deepEqual(getAnnotationType(datasets), ['cell boundary', 'expert annotated', 'point', 'polygon', 'weak labels']);
    assert.deepEqual(getAnnotationType(null), []);
    assert.deepEqual(datasets, before);
});
