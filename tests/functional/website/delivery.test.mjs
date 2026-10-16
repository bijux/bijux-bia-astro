import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';
import { verifyDelivery } from '../../support/website/delivery.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const pages = { '/bioimage-archive/': '<h1>Home</h1>',
    '/bioimage-archive/redirect_index.html': '<h1>Redirect document</h1>',
    '/bioimage-archive/study/S-BIAD3335/': '<h1>Study</h1>',
    '/bioimage-archive/images?size_t=1': '<!doctype html><html><head><title>Images</title></head><body><main>Images</main></body></html>' };
const routes = ['index.html', 'redirect_index.html', 'study/S-BIAD3335/index.html'];

async function fixture(t, mode = '') {
    const parent = await ownedDirectory(repository, 'artifacts/testing/website-delivery');
    const root = await mkdtemp(path.join(parent, 'application-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'artifacts/deployment'), { recursive: true });
    const reportPath = path.join(root, 'report.json');
    const prefix = 'artifacts/dist/bioimage-archive/client/';
    const files = Object.fromEntries(routes.map((route, index) => [prefix + route,
        createHash('sha256').update(Object.values(pages)[index]).digest('hex')]));
    await writeFile(path.join(root, 'artifacts/deployment/manifest.json'), JSON.stringify({ files }));
    await writeFile(reportPath, JSON.stringify({ generatedHtml: routes.length,
        generatedRoutes: mode === 'omitted' ? routes.slice(1) : mode === 'duplicate' ? [...routes, routes[0]] : routes,
        serverRoutes: mode === 'server-duplicate' ? ['/images?size_t=1', '/images?size_t=1'] : mode === 'server-foreign' ? ['//unrecorded.example/images'] : ['/images?size_t=1'] }));
    const requests = [];
    const server = createServer((request, response) => {
        requests.push(request.url);
        const serverDocument = request.url.startsWith('/bioimage-archive/images?');
        response.statusCode = mode === 'redirect' ? 302 : mode === 'missing' || serverDocument && mode === 'server-missing' ? 404 : 200;
        response.setHeader('Content-Type', mode === 'content-type' ? 'application/json' : 'text/html; charset=utf-8');
        if (mode !== 'headers') response.setHeader('X-Content-Type-Options', 'nosniff');
        if (mode === 'redirect') response.setHeader('Location', '/bioimage-archive/');
        response.end(mode === 'body' ? 'unexpected document' : serverDocument && mode === 'server-markup' ?
            '<!doctype html><html><head><title>Images</title></head><body><label><div>Invalid label</div></label></body></html>' :
            serverDocument && mode === 'server-blank' ? '' : pages[request.url]);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    return { application: root, reportPath, requests, baseURL: `http://127.0.0.1:${server.address().port}` };
}

test('all representative documents retain sealed bytes, including nested and standalone index filenames', async t => {
    const options = await fixture(t);
    const delivery = await verifyDelivery(options);
    assert.equal(delivery.status, 'COMPLETED');
    assert.deepEqual([...delivery.verified].sort(), routes);
    assert.deepEqual(options.requests.sort(), Object.keys(pages).sort());
    const report = JSON.parse(await readFile(options.reportPath, 'utf8'));
    assert.deepEqual(report.delivery, delivery);
    assert.match(delivery.manifestHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(delivery.serverVerified, ['/images?size_t=1']);
    assert.match(delivery.servedDocumentHashes['/images?size_t=1'], /^[a-f0-9]{64}$/);
});

for (const [mode, expected] of [
    ['body', /Served HTML differs/], ['missing', /Document route failed/],
    ['redirect', /Document route failed/], ['content-type', /Wrong document type/],
    ['headers', /Missing response protection/], ['omitted', /coverage differ/],
    ['duplicate', /coverage differ/],
]) {
    test(`delivery verification records a failure for ${mode}`, async t => {
        const options = await fixture(t, mode);
        await assert.rejects(verifyDelivery(options), expected);
        const report = JSON.parse(await readFile(options.reportPath, 'utf8'));
        assert.equal(report.delivery.status, 'FAILED');
        assert.match(report.delivery.error, expected);
        assert.deepEqual(report.delivery.verified, []);
        if (['omitted', 'duplicate'].includes(mode)) assert.deepEqual(options.requests, []);
    });
}


for (const [mode, expected] of [
    ['server-markup', /Invalid served HTML/], ['server-blank', /Invalid served HTML/],
    ['server-missing', /Document route failed/], ['server-foreign', /Invalid server route/],
    ['server-duplicate', /Duplicate server route coverage/],
]) {
    test(`on-demand document verification records a failure for ${mode}`, async t => {
        const options = await fixture(t, mode);
        await assert.rejects(verifyDelivery(options), expected);
        const report = JSON.parse(await readFile(options.reportPath, 'utf8'));
        assert.equal(report.delivery.status, 'FAILED');
        assert.deepEqual(report.delivery.serverVerified, []);
        assert.match(report.delivery.error, expected);
        if (['server-foreign', 'server-duplicate'].includes(mode)) assert.deepEqual(options.requests, []);
        else assert.deepEqual(report.delivery.verified, routes);
    });
}
