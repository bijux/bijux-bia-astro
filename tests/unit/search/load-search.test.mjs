import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadSearchPage } from '../../../src/features/search/load-search.ts';

const response = JSON.parse(await readFile(new URL('../../fixtures/api/browse-image-response.json', import.meta.url)));

test('search loading retains numeric selections, sort aliases and exact scientific API operators without mutating responses', async () => {
    const original = JSON.stringify(response);
    const calls = [];
    const url = new URL('https://example.org/images?size_t.eq=+1&total_physical_size_x=%E2%89%A41e-9&pagination.page_size=25&sortBy=accession&sortOrder=ascending');
    const view = await loadSearchPage(url, '', 'image', 'https://api.example.org/v1', { request: async value => { calls.push(new URL(value)); return response; } });
    assert.equal(view.status, 200);
    assert.equal(view.sortBy, 'accession_id'); assert.equal(view.sortOrder, 'asc');
    assert.deepEqual(view.selectedFacets.size_t, ['1']);
    assert(view.facets.size_t.options.some(option => option.value === '1'));
    assert.equal(calls[0].searchParams.get('total_physical_size_x.lte'), '1e-9');
    assert.equal(calls[0].searchParams.get('pagination.page_size'), '25');
    assert.equal(JSON.stringify(response), original);
    assert.notEqual(view.results, response.hits.hits);
});

test('invalid controls do not fetch and failed/malformed aggregations cannot masquerade as completed facets', async () => {
    let calls = 0;
    const invalid = await loadSearchPage(new URL('https://example.org/images?pagination.page_size=Infinity'), '', 'image', 'https://api.example.org', { request: async () => { calls++; return response; } });
    assert.equal(invalid.status, 400); assert.equal(calls, 0);
    for (const request of [
        async () => { throw new Error('Unavailable'); },
        async () => ({ ...response, facets: { time_steps: { buckets: [null] } } }),
        async () => ({ ...response, pagination: null }),
    ]) {
        const failed = await loadSearchPage(new URL('https://example.org/images?size_t=1'), '', 'image', 'https://api.example.org', { request: request });
        assert.equal(failed.status, 502);
        assert.equal(failed.results, undefined);
        assert.deepEqual(failed.facets, {});
        assert.match(failed.requestError, /temporarily unavailable/);
    }
});

test('cursor requests preserve query/filter state while removing numbered transport paging', async () => {
    let requested;
    const view = await loadSearchPage(new URL('https://example.org/images?cursor=opaque&pagination.page=9&size_t=1'), 'cell', 'image', 'https://api.example.org', { request: async value => { requested = new URL(value); return response; } });
    assert.equal(requested.searchParams.get('cursor'), 'opaque');
    assert.equal(requested.searchParams.has('pagination.page'), false);
    assert.equal(requested.searchParams.get('query'), 'cell');
    assert.equal(requested.searchParams.get('size_t.eq'), '1');
    assert.equal(view.displayPage, view.cappedPage + 1);
});

test('toolbar URL changes retain repeated facets/query while dropping stale cursor and page state', async () => {
    const { changedSearchURL } = await import('../../../src/features/search/state.ts');
    const current = new URL('https://example.org/images?size_t=1&size_t=2-10&query=cell&cursor=old&pagination.page=9');
    const resized = changedSearchURL(current, { pageSize: '60' });
    assert.deepEqual(resized.searchParams.getAll('size_t'), ['1', '2-10']);
    assert.equal(resized.searchParams.get('query'), 'cell');
    assert.equal(resized.searchParams.get('pagination.page_size'), '60');
    assert.equal(resized.searchParams.has('cursor'), false);
    assert.equal(resized.searchParams.has('pagination.page'), false);
    const sorted = changedSearchURL(resized, { sortBy: 'accession_id', sortOrder: 'asc', reset: false });
    assert.equal(sorted.searchParams.get('sort_source'), 'user');
    assert.equal(changedSearchURL(sorted, { sortBy: '', sortOrder: '', reset: true }).searchParams.has('sort_by'), false);
    assert.equal(current.searchParams.get('cursor'), 'old');
});

test('an interrupted search forwards cancellation to the bounded API transport', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Client left the page'));
    const view = await loadSearchPage(new URL('https://example.org/images'), '', 'image', 'https://api.example.org', {
        signal: controller.signal,
        request: async (_url, { signal }) => { assert.equal(signal, controller.signal); signal.throwIfAborted(); },
    });
    assert.equal(view.status, 502);
    assert.equal(view.results, undefined);
});
