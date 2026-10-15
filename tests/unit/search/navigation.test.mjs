import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanHistoryURL } from '../../../src/features/search/history.mjs';
import { generateParamString } from '../../../src/features/search/query.mjs';

test('visible search history strips transport state and retains repeated filters and page size', () => {
    const original = new URL('https://example.org/bioimage-archive/images?query=cell&size_t=1&size_t=2-10&pagination.page_size=25&cursor=private&pagination.page=8&page=8&prev_cursor_1=a&prev_cursor_2=b');
    const result = cleanHistoryURL(original, original.origin);
    assert.equal(original.searchParams.get('cursor'), 'private');
    assert.deepEqual([...result.searchParams], [['query', 'cell'], ['size_t', '1'], ['size_t', '2-10'], ['pagination.page_size', '25']]);
});

test('API scientific intervals retain exact endpoints and user-selected sort', () => {
    const url = new URL(generateParamString('https://example.org/website/browse/image', 'cell', 2, { voxel_physical_size_x: ['1e-9-2e-9'] }, 25, 'relevance', 'desc', 'user'));
    assert.equal(url.searchParams.get('voxel_physical_size_x.gte'), '1e-9');
    assert.equal(url.searchParams.get('voxel_physical_size_x.lte'), '2e-9');
    assert.equal(url.searchParams.get('sort_by'), 'relevance');
    assert.equal(url.searchParams.get('pagination.page'), '2');
});
