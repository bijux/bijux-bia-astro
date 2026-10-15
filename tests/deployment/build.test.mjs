import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildConfiguration } from '../../scripts/deployment/configuration.mjs';
import { deploymentConfiguration, verifyDeployment } from '../../scripts/deployment/manifest.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

test('a Node deployment builds once, serves offline, preserves its configuration and rejects stale or altered output', async t => {
    const output = path.join(repository, 'artifacts/deployment-tests');
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, 'application-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let collected = 0;
    const upstream = createServer((_request, response) => {
        collected++;
        response.setHeader('Content-Type', 'application/json');
        response.end('{"title":"Collected catalogue"}');
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const api = `http://127.0.0.1:${upstream.address().port}`;
    for (const directory of ['src/pages', 'public', 'scripts']) await mkdir(path.join(root, directory), { recursive: true });
    await cp(path.join(repository, 'scripts/deployment'), path.join(root, 'scripts/deployment'), { recursive: true });
    await cp(path.join(repository, 'scripts/catalogue'), path.join(root, 'scripts/catalogue'), { recursive: true });
    await cp(path.join(repository, 'package-lock.json'), path.join(root, 'package-lock.json'));
    await cp(path.join(repository, 'scripts/server.mjs'), path.join(root, 'scripts/server.mjs'));
    await cp(path.join(repository, 'src/security'), path.join(root, 'src/security'), { recursive: true });
    await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    const { scripts } = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { build: scripts.build } }));
    await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: 'astro/tsconfigs/base', include: ['.astro/types.d.ts', 'src/**/*'] }));
    await writeFile(path.join(root, 'astro.config.mjs'), `
import config from ${JSON.stringify(pathToFileURL(path.join(repository, 'astro.config.mjs')).href)};
export default { ...config, root: ${JSON.stringify(root)}, integrations: [] };
`);
    await writeFile(path.join(root, 'src/pages/index.astro'), `---
import { PUBLIC_SEARCH_API, PUBLIC_WEBSITE_STATE } from 'astro:env/client';
import { fetchJSON } from '../security/requests.mjs';
const catalogue = await fetchJSON(PUBLIC_SEARCH_API);
---
<html><body><h1>{catalogue.title}</h1><p>{PUBLIC_WEBSITE_STATE}</p></body></html>`);
    await writeFile(path.join(root, 'src/pages/configuration.json.js'), `import { PUBLIC_SEARCH_API } from 'astro:env/client';
export const prerender=false;
export async function GET({url}){
    if(url.searchParams.has('drain')){console.log('Active deployment request');await new Promise(resolve=>setTimeout(resolve,150));}
    return Response.json({api:PUBLIC_SEARCH_API});
}`);
    await writeFile(path.join(root, 'public/robots.txt'), 'User-agent: *\n');
    await writeFile(path.join(root, 'public/redirect_index.html'), '<html><body>Root redirect</body></html>');
    const env = { ...process.env, PUBLIC_SEARCH_API: api, PUBLIC_WEBSITE_STATE: 'PROD', PUBLIC_ALLOW_LOCAL_VIEWERS: 'true', SITE_URL: 'http://localhost', ASTRO_TELEMETRY_DISABLED: '1' };
    const build = async () => {
        try { return await execute(process.execPath, ['scripts/deployment/build.mjs'], { cwd: root, env, timeout: 120000, maxBuffer: 2 * 1024 * 1024 }); }
        catch (error) {
            error.message += `\n${error.stdout ?? ''}\n${error.stderr ?? ''}`;
            throw error;
        }
    };
    await build();
    assert.equal(collected, 1);
    const manifest = await verifyDeployment(root);
    const manifestFile = path.join(root, 'artifacts/deployment/manifest.json');
    assert.equal(manifest.configuration.PUBLIC_SEARCH_API, api);
    assert.equal(manifest.catalogue.studies, 0);
    assert.equal(manifest.catalogue.responses, 1);
    assert.equal(manifest.configuration.PUBLIC_WEBSITE_STATE, 'PROD');
    await assert.rejects(deploymentConfiguration(manifestFile, { PUBLIC_SEARCH_API: 'https://different.example.org' }), /fixed at build time/);
    const htmlFile = path.join(root, 'artifacts/dist/bioimage-archive/client/index.html');
    const html = await readFile(htmlFile, 'utf8');
    await new Promise(resolve => upstream.close(resolve));
    const snapshots = path.join(root, 'artifacts/catalogue/snapshots');
    const captured = await readdir(snapshots);
    assert.equal(captured.length, 1);
    env.CATALOGUE_SNAPSHOT = path.join(snapshots, captured[0]);
    await build();
    assert.equal(await readFile(htmlFile, 'utf8'), html);
    assert.equal(collected, 1);
    const reports = path.join(root, 'artifacts/catalogue/builds');
    const builds = await Promise.all((await readdir(reports)).map(async name => JSON.parse(await readFile(path.join(reports, name, 'report.json'), 'utf8'))));
    assert(builds.some(report => report.mode === 'replay' && report.network === 0));
    // Serving does not require source templates or an Astro configuration.
    const configSource = await readFile(path.join(root, 'astro.config.mjs'));
    const indexSource = await readFile(path.join(root, 'src/pages/index.astro'));
    await rm(path.join(root, 'src/pages'), { recursive: true });
    await rm(path.join(root, 'astro.config.mjs'));
    await writeFile(path.join(root, 'deny-fetch.mjs'), 'globalThis.fetch=()=>{throw new Error("Startup must not fetch catalogue data");};');
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ['--import', './deny-fetch.mjs', 'scripts/server.mjs'], {
        cwd: root, env: { ...env, HOST: '127.0.0.1', PORT: String(port), DEPLOYMENT_MANIFEST: manifestFile }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
    let diagnostics = '';
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    child.stdout.resume();
    const address = `http://127.0.0.1:${port}/bioimage-archive/`;
    const deadline = Date.now() + 10000;
    let served;
    while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(diagnostics);
        try { served = await fetch(address); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert(served, diagnostics);
    assert.equal(served.status, 200);
    assert.equal(await served.text(), html);
    assert.match(served.headers.get('Permissions-Policy'), /loopback-network=\(self/);
    assert.deepEqual(await (await fetch(address + 'configuration.json')).json(), { api });
    assert.equal(collected, 1);
    const active = once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    const response = fetch(address + 'configuration.json?drain', { signal: AbortSignal.timeout(5000) });
    assert.match(String((await active)[0]), /Active deployment request/);
    const closed = once(child, 'exit', { signal: AbortSignal.timeout(15000) });
    child.kill('SIGTERM');
    assert.deepEqual(await (await response).json(), { api });
    assert.deepEqual(await closed, [0, null]);
    const provenanceFile = path.join(root, 'artifacts/deployment/catalogue.json');
    const provenance = await readFile(provenanceFile);
    await writeFile(provenanceFile, JSON.stringify({ ...manifest.catalogue, studies: 999 }));
    await assert.rejects(verifyDeployment(root), /Catalogue provenance differs/);
    await writeFile(provenanceFile, provenance);
    await writeFile(htmlFile, html + '\nchanged');
    await assert.rejects(verifyDeployment(root), /differ from the verified build/);
    await mkdir(path.join(root, 'src/pages'));
    await writeFile(path.join(root, 'astro.config.mjs'), configSource);
    await writeFile(path.join(root, 'src/pages/index.astro'), indexSource);
    env.PUBLIC_WEBSITE_STATE = 'DEV';
    await assert.rejects(build(), error => /Snapshot public configuration differs/.test(error.stdout + error.stderr));
    delete env.CATALOGUE_SNAPSHOT;
    env.PUBLIC_WEBSITE_STATE = 'PROD';
    await assert.rejects(build(), error => /fetch failed|ECONNREFUSED/.test(error.stdout + error.stderr));
    await assert.rejects(readFile(manifestFile), { code: 'ENOENT' });
});

test('deployment configuration rejects unsafe origins and ambiguous viewer permissions', () => {
    for (const environment of [
        { PUBLIC_SEARCH_API: 'file:///etc/passwd' }, { PUBLIC_MONGO_API: 'https://user:secret@example.org' },
        { SITE_URL: 'https://example.org/path' }, { SITE_URL: 'https://example.org/?query=1' },
        { PUBLIC_ALLOW_LOCAL_VIEWERS: 'yes' },
    ]) assert.throws(() => buildConfiguration(environment));
});
