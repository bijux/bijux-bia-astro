import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const fixtures = new URL('../../fixtures/api/', import.meta.url);

test("shared API captures retain endpoint-specific response envelopes and recorded hashes", async () => {
    const provenance = JSON.parse(await readFile(new URL('provenance.json', fixtures), 'utf8'));
    const captures = await Promise.all(provenance.responses.map(async entry => {
        const bytes = await readFile(new URL(entry.file, fixtures));
        return { ...entry, actualHash: createHash('sha256').update(bytes).digest('hex'), response: JSON.parse(bytes) };
    }));
    const actual = (await readdir(fixtures)).filter(name => name.endsWith('-response.json')).sort();
    assert.deepEqual(captures.map(capture => capture.file).sort(), actual,
        'Each complete capture must have exactly one provenance entry.');
    for (const file of ["study-s-biad3335-response.json", "study-s-biad3397-response.json",
        "image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json"]) {
        assert(captures.some(capture => capture.file === file), file);
    }
    for (const capture of captures) {
        assert.equal(capture.actualHash, capture.sha256, capture.file);
        assert.equal(new URL(capture.url).protocol, "https:");
        assert(capture.capturedAt);
        const pathname = new URL(capture.url).pathname;
        if (pathname.startsWith('/search/v1/website/')) {
            assert(Array.isArray(capture.response.hits.hits), capture.file);
            assert("facets" in capture.response && "pagination" in capture.response, capture.file);
        } else if (/^\/bioimage-archive\/api\/v2\/dataset\/[^/]+\/file_reference$/.test(pathname)) {
            assert(Array.isArray(capture.response), capture.file);
        } else if (/^\/biostudies\/api\/v1\/studies\/[^/]+\/info$/.test(pathname)) {
            assert.equal(typeof capture.response.httpLink, 'string', capture.file);
        } else assert.fail(`Unrecognised capture endpoint: ${capture.file}`);
    }
});

