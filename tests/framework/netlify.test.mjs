import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));

test('the real Netlify configuration builds collections and serves search with application headers', async t => {
    const output = path.join(repository, 'artifacts/netlify-adapter-tests');
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, 'application-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const captured = await readFile(path.join(repository, 'tests/fixtures/api/browse-image-response.json'));
    const requests = [];
    const server = createServer((request, response) => {
        requests.push(request.url);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(captured);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const api = `http://127.0.0.1:${server.address().port}`;
    await cp(path.join(repository, 'src'), path.join(root, 'src'), {
        recursive: true, filter: source => source !== path.join(repository, 'src/pages'),
    });
    await mkdir(path.join(root, 'src/pages'));
    await cp(path.join(repository, 'src/pages/images.astro'), path.join(root, 'src/pages/images.astro'));
    await writeFile(path.join(root, 'src/pages/index.astro'), `---
import BaseLayout from '../layouts/BaseLayout.astro';
import News from '../components/News.astro';
---
<BaseLayout pageTitle="Adapter verification"><News /></BaseLayout>`);
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
    await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    await mkdir(path.join(root, 'artifacts/netlify'), { recursive: true });
    await symlink('artifacts/netlify', path.join(root, '.netlify'), 'dir');
    await writeFile(path.join(root, 'astro.config.mjs'), `
import config from ${JSON.stringify(pathToFileURL(path.join(repository, 'astro.config.mjs')).href)};
export default { ...config, root: ${JSON.stringify(root)} };
`);
    const env = { ...process.env, NETLIFY: 'true', SITE_URL: 'https://preview.example.org', PUBLIC_SEARCH_API: api, ASTRO_TELEMETRY_DISABLED: '1' };
    await promisify(execFile)(process.execPath, [path.join(repository, 'node_modules/astro/bin/astro.mjs'), 'build'], {
        cwd: root, env, timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    });
    const html = await readFile(path.join(root, 'artifacts/dist/bioimage-archive/index.html'), 'utf8');
    assert.match(html, /id="newsSlides"/);
    assert.match(html, /class="vf-summary__date"/);
    const entry = path.join(root, '.netlify/v1/functions/ssr/ssr.mjs');
    const { default: handler } = await import(pathToFileURL(entry).href);
    const context = { ip: '127.0.0.1', requestId: 'adapter-verification' };
    const response = await handler(new Request('https://preview.example.org/bioimage-archive/images?size_t=1'), context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(await response.text(), /name="size_t"[^>]*value="1"[^>]*checked|checked[^>]*name="size_t"[^>]*value="1"/);
    assert.equal(requests.length, 1);
    const redirects = await readFile(path.join(root, 'artifacts/dist/bioimage-archive/_redirects'), 'utf8');
    assert.match(redirects, /^\/bioimage-archive\/ai\s+\/bioimage-archive\/galleries\/ai\s+301/m);
    const invalid = await handler(new Request('https://preview.example.org/bioimage-archive/images?pagination.page_size=1000000'), context);
    assert.equal(invalid.status, 400);
    assert.equal(requests.length, 1);
});
