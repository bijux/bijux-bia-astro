import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { snapshotTransport, canonical, digest } from "../../../scripts/catalogue/transport.mjs";
import { catalogueCoverage, sealSnapshot, verifySnapshot } from "../../../scripts/catalogue/snapshot.mjs";

async function directory(t) {
    const output = fileURLToPath(new URL("../../../artifacts/catalogue-tests/", import.meta.url));
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, 'inputs-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    return root;
}
const environment = { PUBLIC_SEARCH_API: 'https://catalogue.example.org/v1' };
function entry(url, data) { return { url: new URL(url), record: { status: 200, body: Buffer.from(JSON.stringify(data)).toString('base64') } }; }
function catalogue() {
    const studies = [{ uuid: 'first', accession_id: 'S-BIAD1' }, { uuid: 'second', accession_id: 'EMPIAR-2' }];
    const entries = studies.map((study, index) => entry(`${environment.PUBLIC_SEARCH_API}/website/browse/study?pagination.page_size=1&pagination.page=${index + 1}`, { hits: { total: { value: 2, relation: 'eq' }, hits: [{ _source: study }] }, pagination: { page: index + 1, total_pages: 2 } }));
    for (const study of studies) entries.push(entry(`${environment.PUBLIC_SEARCH_API}/website/study?facet.accession_id=${study.accession_id}`, { hits: { hits: [{ _source: study }] } }));
    entries.push(entry('https://www.ebi.ac.uk/biostudies/api/v1/studies/S-BIAD1/info', { httpLink: 'https://files.example.org/study' }));
    return entries;
}

test('capture coalesces in-flight and repeated requests, bounds concurrency, and replays immutable responses offline', async t => {
    const root = await directory(t);
    let calls = 0, active = 0, peak = 0;
    const upstream = createServer(async (_request, response) => {
        calls++; active++; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
        response.setHeader('Content-Type', 'application/json');
        response.end('{"metadata":"µ | unchanged"}');
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const origin = `http://127.0.0.1:${upstream.address().port}`;
    const transport = snapshotTransport({ directory: root, concurrency: 2 });
    const request = value => transport.fetch(origin + value, { redirect: 'manual' });
    const responses = await Promise.all(['/one', '/one', '/two', '/three', '/four', '/two'].map(request));
    for (const response of responses) assert.deepEqual(await response.json(), { metadata: 'µ | unchanged' });
    assert.equal(calls, 4);
    assert.equal(peak, 2);
    await (await request('/one')).json();
    assert.equal(calls, 4);
    await writeFile(path.join(root, 'environment.json'), JSON.stringify(environment));
    const index = await sealSnapshot(root, { root, required: false });
    await verifySnapshot(root);
    await new Promise(resolve => upstream.close(resolve));
    let unexpected = 0;
    const replay = snapshotTransport({ directory: root, index, fetch: () => { unexpected++; throw new Error('Network must remain unused.'); } });
    assert.deepEqual(await (await replay.fetch(origin + '/one', { redirect: 'manual' })).json(), { metadata: 'µ | unchanged' });
    await assert.rejects(replay.fetch(origin + '/missing', { redirect: 'manual' }), /no response/);
    assert.equal(unexpected, 0);
    assert.equal(replay.errors.length, 1);
    const key = canonical({ url: origin + '/one', headers: [] });
    await writeFile(path.join(root, digest(key) + '.json'), 'changed');
    await assert.rejects(verifySnapshot(root), /hash mismatch/);
});

test('one cancelled caller cannot abort a shared capture; private requests and oversized or linked inputs fail closed', async t => {
    const root = await directory(t);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const transport = snapshotTransport({ directory: root, fetch: async () => { calls++; await gate; return new Response('data'); } });
    const controller = new AbortController();
    const cancelled = transport.fetch('https://example.org/data', { redirect: 'manual', signal: controller.signal });
    const retained = transport.fetch('https://example.org/data', { redirect: 'manual' });
    controller.abort(new Error('Caller stopped'));
    await assert.rejects(cancelled, /Caller stopped/);
    release();
    assert.equal(await (await retained).text(), 'data');
    assert.equal(calls, 1);
    await assert.rejects(transport.fetch('https://example.org/data', { redirect: 'manual', headers: { Authorization: 'private' } }), /unauthenticated/);
    const limited = snapshotTransport({ directory: root, maxBytes: 2, fetch: async () => new Response('too large') });
    await assert.rejects(limited.fetch('https://example.org/large', { redirect: 'manual' }), /size limit/);
    await writeFile(path.join(root, 'environment.json'), JSON.stringify(environment));
    const index = await sealSnapshot(root, { root, required: false });
    const id = Object.keys(index.responses)[0];
    const record = await readFile(path.join(root, id + '.json'));
    await rm(path.join(root, id + '.json'));
    await writeFile(path.join(root, 'linked-data'), record);
    await symlink(path.join(root, 'linked-data'), path.join(root, id + '.json'));
    await assert.rejects(verifySnapshot(root), /regular file/);
});

test('catalogue coverage requires consistent enumeration, matching full records, enrichments and every generated route', () => {
    const valid = catalogue();
    assert.deepEqual(catalogueCoverage(valid, environment, ['EMPIAR-2', 'S-BIAD1'], true).accessions, ['EMPIAR-2', 'S-BIAD1']);
    for (const mutate of [
        entries => entries.splice(1, 1),
        entries => { entries[1] = entry(entries[1].url, { hits: { total: { value: 3, relation: 'eq' }, hits: [{ _source: { accession_id: 'S-BIAD1' } }] }, pagination: { page: 2, total_pages: 2 } }); },
        entries => { entries[1] = entry(entries[1].url, { hits: { total: { value: 2, relation: 'eq' }, hits: [{ _source: { uuid: 'first', accession_id: 'S-BIAD1' } }] }, pagination: { page: 2, total_pages: 2 } }); },
        entries => entries.splice(2, 1),
        entries => { entries[2] = entry(entries[2].url, { hits: { hits: [{ _source: { accession_id: 'S-BIAD1', uuid: 'wrong' } }] } }); },
        entries => entries.pop(),
    ]) {
        const entries = catalogue(); mutate(entries);
        assert.throws(() => catalogueCoverage(entries, environment, ['S-BIAD1', 'EMPIAR-2'], true));
    }
    assert.throws(() => catalogueCoverage(valid, environment, ['S-BIAD1'], true), /Generated study routes/);
});
