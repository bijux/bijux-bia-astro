import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixture } from './server.mjs';
import { imageUUID, primaryAccessions } from './catalog.mjs';

test('actual HTTP fixture exposes source-consumed study, image, relationship and pagination fields', async () => {
  const fixture = await startFixture();
  try {
    const study = await (await fetch(`${fixture.origin}/search/v1/website/study?facet.accession_id=${primaryAccessions[0]}`)).json();
    const source = study.hits.hits[0]._source;
    assert.equal(source.accession_id, primaryAccessions[0]);
    assert.equal(source.dataset[0].file_reference_count, 2);
    assert.equal(source.dataset[0].file_reference_size_bytes, 2048);
    assert.equal(source.image[0].uuid, imageUUID(primaryAccessions[0]));
    const image = await (await fetch(`${fixture.origin}/search/v1/website/image?query=${source.image[0].uuid}`)).json();
    assert.equal(image.hits.hits[0]._source.submission_dataset_uuid, source.dataset[0].uuid);
    assert.equal(image.hits.hits[0]._source.additional_metadata[0].value.slice.uri, source.example_image_uri[0]);
    const page = await (await fetch(`${fixture.origin}/search/v1/website/browse/study?pagination.page_size=1&pagination.page=2`)).json();
    assert.equal(page.hits.total.value, 2);
    assert.equal(page.hits.hits[0]._source.accession_id, primaryAccessions[1]);
    assert.equal(page.pagination.total_pages, 2);
  } finally { await fixture.close(); }
});

test('empty, unknown, missing optional, malformed, delayed and failed responses remain distinct', async () => {
  const fixture = await startFixture();
  try {
    const base = `${fixture.origin}/search/v1/website/study`;
    for (const query of ['facet.accession_id=unknown', 'fixture_case=empty']) {
      const response = await fetch(`${base}?${query}`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).hits.hits, []);
    }
    const optional = await (await fetch(`${base}?fixture_case=missing-optional`)).json();
    assert.equal('author' in optional.hits.hits[0]._source, false);
    assert.equal((await fetch(`${base}?fixture_case=error`)).status, 503);
    await assert.rejects((await fetch(`${base}?fixture_case=malformed`)).json(), SyntaxError);
    await assert.rejects(fetch(`${base}?fixture_case=delay`, { signal: AbortSignal.timeout(10) }));
    assert.equal((await fetch(`${fixture.origin}/undeclared`)).status, 404);
    assert.equal((await fetch(`${base}`, { method: 'POST' })).status, 400);
  } finally { await fixture.close(); }
});

test('fixture binds loopback and rejects a conflicting port', async () => {
  const fixture = await startFixture();
  try {
    assert.equal(new URL(fixture.origin).hostname, '127.0.0.1');
    await assert.rejects(startFixture({ port: Number(new URL(fixture.origin).port) }), error => error.code === 'EADDRINUSE');
  } finally { await fixture.close(); }
});
