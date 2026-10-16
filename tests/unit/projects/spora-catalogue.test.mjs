import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterDatasets, getCategoryCounts } from '../../../src/features/projects/spora/catalogue.mjs';

const datasets = [
    { name: 'First', citation: 'Alpha', cancer: ['lung'], modalities: ['HE', 'IF'], type: 'WSI' },
    { name: 'Second', citation: 'Beta', cancer: ['breast'], modalities: ['IF'], type: 'ROI' },
];
test('SPORA filters intersect across groups and clear without changing catalogue order or records', () => {
    const before = structuredClone(datasets);
    assert.deepEqual(filterDatasets(datasets, { term: ' ALPHA ', modality: ['IF'], type: ['WSI'] }), [datasets[0]]);
    assert.deepEqual(filterDatasets(datasets, { cancer: ['lung', 'breast'], modality: ['IF'] }), datasets);
    assert.deepEqual(filterDatasets(datasets, { cancer: ['lung'], type: ['ROI'] }), []);
    assert.deepEqual(filterDatasets(datasets), datasets);
    assert.deepEqual(getCategoryCounts(datasets, 'modalities'), [{ category: 'HE', count: 1 }, { category: 'IF', count: 2 }]);
    assert.deepEqual(datasets, before);
});

test('category counts retain prototype-like names, duplicates and ordinary categories without mutation', () => {
    const records = [{ modalities: ['constructor', '__proto__', 'IF', 'toString', 'constructor'] },
        { modalities: ['__proto__', 'IF'] }];
    const before = structuredClone(records);
    const counts = new Map(getCategoryCounts(records, 'modalities').map(({ category, count }) => [category, count]));
    assert.deepEqual(counts, new Map([['__proto__', 2], ['constructor', 2], ['IF', 2], ['toString', 1]]));
    assert.deepEqual(records, before);
});
