import assert from 'node:assert/strict';
import test from 'node:test';
import { getFileReferences } from '../../../src/api/file-references.mjs';

test('the configured API root, opaque identifier and cancellation signal reach one bounded request', async () => {
    const files = [{ uuid: 'first', file_path: 'literal <file>', uri: 'https://example.org/file', additional_metadata: null }];
    const signal = new AbortController().signal;
    let calls = 0;
    const result = await getFileReferences('https://example.org/catalogue/v2/', 'literal & µ?name', { signal,
        request: async (url, options) => {
            calls++;
            assert.equal(url, 'https://example.org/catalogue/v2/dataset/literal%20%26%20%C2%B5%3Fname/file_reference?page_size=1000');
            assert.equal(options.signal, signal);
            return files;
        } });
    assert.equal(calls, 1); assert.equal(result, files); assert.equal(result[0], files[0]);
    assert.deepEqual(await getFileReferences('http://127.0.0.1:1234/api', 'dataset', { request: async () => [] }), []);
});

test('invalid API roots and path identifiers fail before any request', async () => {
    const request = () => assert.fail('Invalid configuration reached the network');
    for (const root of ['', null, [], 'ftp://example.org/', 'https://user:password@example.org/', 'https://example.org/?token=value', 'https://example.org/#section']) {
        await assert.rejects(getFileReferences(root, 'dataset', { request }), /Invalid file API root/);
    }
    for (const id of ['', ' ', '.', '..', 'parent/child', 'parent\\child', 'line\nbreak', null, 0]) {
        await assert.rejects(getFileReferences('https://example.org', id, { request }), /Invalid dataset path identifier/);
    }
});

test('file responses retain optional metadata while malformed and over-limit results identify the dataset', async () => {
    const accepted = [{ additional_metadata: null }, { uuid: null, file_path: null, uri: null }, {}];
    assert.equal(await getFileReferences('https://example.org', 'dataset', { request: async () => accepted }), accepted);
    assert.equal((await getFileReferences('https://example.org', 'dataset', { request: async () => Array(1000).fill({}) })).length, 1000);
    for (const value of [null, {}, [null], [[]], [{ additional_metadata: {} }], [{ additional_metadata: [null] }],
        [{ uuid: 1 }], [{ file_path: {} }], [{ uri: [] }], Array(1001).fill({})]) {
        await assert.rejects(getFileReferences('https://example.org', 'example-id', { request: async () => value }),
            { name: 'TypeError', message: 'Invalid file references for dataset example-id.' });
    }
    const failure = new Error('Controlled API failure');
    await assert.rejects(getFileReferences('https://example.org', 'dataset', { request: async () => { throw failure; } }), error => error === failure);
});
