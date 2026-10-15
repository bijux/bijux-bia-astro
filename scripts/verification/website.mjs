import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from 'playwright';
import { HtmlValidate } from 'html-validate';
import { fixtureResponse } from '../../tests/fixtures/website/responses.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(repository, 'artifacts/website-verification');
const root = path.join(output, 'application');
await mkdir(output, { recursive: true });
await rm(path.join(output, 'report.json'), { force: true });
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
for (const name of ['src', 'public', 'scripts', 'tests/fixtures', 'package.json', 'package-lock.json', 'tsconfig.json']) await cp(path.join(repository, name), path.join(root, name), { recursive: true });
const pages = ['index.astro', 'images.astro', 'studies.astro', 'study/[accessionID].astro', 'projects/spora/dataset.astro'];
await rm(path.join(root, 'src/pages'), { recursive: true });
for (const page of pages) {
    await mkdir(path.dirname(path.join(root, 'src/pages', page)), { recursive: true });
    await cp(path.join(repository, 'src/pages', page), path.join(root, 'src/pages', page));
}
await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
await writeFile(path.join(root, 'astro.config.mjs'), `import config from ${JSON.stringify(pathToFileURL(path.join(repository, 'astro.config.mjs')).href)};\nexport default {...config,root:${JSON.stringify(root)}};\n`);
const preload = pathToFileURL(path.join(root, 'tests/fixtures/website/preload.mjs')).href;
const env = { ...process.env, NETLIFY: 'false', NETLIFY_DEV: 'false', AWS_LAMBDA_FUNCTION_NAME: '', PUBLIC_SEARCH_API: 'https://alpha.bioimagearchive.org/search/v1', PUBLIC_MONGO_API: 'https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2', PUBLIC_GTAG: '', PUBLIC_WEBSITE_STATE: 'PROD', PUBLIC_ALLOW_LOCAL_VIEWERS: 'false', SITE_URL: 'http://localhost', NODE_OPTIONS: `--import=${preload}`, ASTRO_TELEMETRY_DISABLED: '1' };
delete env.CATALOGUE_SNAPSHOT;
async function run(args) {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, `Verification subprocess failed: ${signal ?? code}`);
}
await run(['scripts/deployment/build.mjs']);
const html = new HtmlValidate(JSON.parse(await readFile(path.join(repository, 'configs/quality/htmlvalidate.markup.json'), 'utf8')));
let generated = 0;
async function validate(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await validate(file);
        else if (entry.name.endsWith('.html')) {
            const result = await html.validateFile(file);
            assert(result.valid, JSON.stringify(result.results));
            generated++;
        }
    }
}
await validate(path.join(root, 'artifacts/dist/bioimage-archive/client'));
assert(generated >= 4, 'Representative static routes were not generated.');
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(process.execPath, ['scripts/server.mjs'], { cwd: root, env: { ...env, HOST: '127.0.0.1', PORT: String(port), DEPLOYMENT_MANIFEST: path.join(root, 'artifacts/deployment/manifest.json') }, stdio: ['ignore', 'inherit', 'inherit'] });
const address = `http://127.0.0.1:${port}`;
let browser;
const errors = [], unexpected = [];
try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null) throw new Error('Verification server exited before readiness.');
        try { ready = (await fetch(address + '/bioimage-archive/')).ok; } catch {}
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(ready, 'Verification server did not become ready.');
    browser = await chromium.launch();
    for (const width of [1440, 375]) {
        const context = await browser.newContext({ ...(width === 375 ? devices['Pixel 7'] : {}), viewport: { width, height: 1000 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === address) return route.continue();
            if (url.origin === 'https://alpha.bioimagearchive.org' || url.origin === 'https://www.ebi.ac.uk' && url.pathname.startsWith('/ebisearch/ws/rest/')) {
                try { return route.fulfill({ json: fixtureResponse(url.href) }); }
                catch (error) { unexpected.push(error.message); return route.abort(); }
            }
            if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ body: '', contentType: 'text/javascript' });
            if (url.origin === 'https://livingobjects.ebi.ac.uk' && url.pathname === '/bioimaging-01-pub/bia-filelist/bff/index.html') return route.fulfill({ body: '<!doctype html><title>External file browser excluded</title>', contentType: 'text/html' });
            if (['image', 'font'].includes(request.resourceType())) return route.fulfill({ status: 204 });
            if (['assets.emblstatic.net', 'ebi.emblstatic.net', 'www.embl.org'].includes(url.hostname)) return route.fulfill({ body: '', contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' });
            unexpected.push(request.url()); return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const unavailable = address + '/bioimage-archive/images?query=unavailable';
        page.on('response', response => { if (response.url().startsWith(address) && response.url() !== unavailable && response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
        page.on('requestfailed', request => { if (request.url().startsWith(address)) errors.push(`Failed request: ${request.url()}`); });
        page.on('dialog', dialog => { errors.push(`Unexpected browser dialog: ${dialog.message()}`); return dialog.dismiss(); });
        page.setDefaultTimeout(10000);
        assert((await page.goto(address + '/bioimage-archive/')).ok());
        await page.getByRole('heading', { name: 'BioImage Archive', exact: true }).waitFor();
        await page.locator('#live-tutorials').getByText('Currently there are no upcoming events', { exact: false }).waitFor();
        await page.locator('#ondemand-tutorials').getByText('Currently there are no upcoming events', { exact: false }).waitFor();
        assert((await page.goto(address + '/bioimage-archive/study/S-BIAD3335')).ok());
        const disclosure = page.locator('.dataset-metadata__record summary').first();
        const details = disclosure.locator('..');
        const before = await details.getAttribute('open');
        await disclosure.focus(); await page.keyboard.press('Space');
        assert.notEqual(await details.getAttribute('open'), before);
        await page.keyboard.press('Enter');
        assert.equal(await details.getAttribute('open'), before);
        await page.locator('#open-cite-dialog').focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#cite-dialog').evaluate(element => element.open));
        await page.keyboard.press('Escape');
        assert(await page.locator('#open-cite-dialog').evaluate(element => element === document.activeElement));
        await page.screenshot({ path: path.join(output, `metadata-${width}.png`), fullPage: true });
        assert((await page.goto(address + '/bioimage-archive/study/EMPIAR-12104')).ok());
        await page.waitForFunction(() => window.jQuery?.fn.dataTable?.isDataTable('#viewable_images_table') && window.jQuery('#viewable_images_table').DataTable().rows().data().length > 0);
        assert.deepEqual(await page.locator('[data-bia-dependency]').evaluateAll(nodes => nodes.map(node => node.dataset.biaDependency)), ['jquery', 'datatables']);
        await page.locator('select[aria-controls="viewable_images_table"]').selectOption('25');
        await page.waitForFunction(() => window.jQuery('#viewable_images_table').DataTable().rows().data().length === 25);
        await page.locator('#viewable_images_table_wrapper [data-action="next"]').click();
        await page.waitForFunction(() => window.jQuery('#viewable_images_table').DataTable().page.info().page === 1 && window.jQuery('#viewable_images_table').DataTable().rows().data().length === 5);
        await page.locator('#showDisplayImagesToggle').focus(); await page.keyboard.press('Space');
        await page.waitForFunction(() => window.jQuery('#viewable_images_table').DataTable().page.info().page === 0 && window.jQuery('#viewable_images_table').DataTable().rows().data().length === 14);
        await page.reload();
        await page.waitForFunction(() => window.jQuery?.fn.dataTable?.isDataTable('#viewable_images_table') && window.jQuery('#viewable_images_table').DataTable().rows().data().length === 14);
        assert(await page.locator('#showDisplayImagesToggle').isChecked());
        assert.equal(await page.locator('select[aria-controls="viewable_images_table"]').inputValue(), '25');
        await page.screenshot({ path: path.join(output, `table-${width}.png`), fullPage: true });
        assert((await page.goto(address + '/bioimage-archive/images?size_t=1')).ok());
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#pageSize').selectOption('30');
        await page.waitForURL('**/*pagination.page_size=30*');
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#searchitem').fill('nuclei');
        await Promise.all([page.waitForURL('**/*query=nuclei*'), page.locator('#searchitem').press('Enter')]);
        await page.locator('#selected-facets').getByText('nuclei', { exact: false }).waitFor();
        assert.equal(await page.locator('#searchitem').inputValue(), 'nuclei');
        assert((await page.goto(address + '/bioimage-archive/projects/spora/dataset')).ok());
        await page.getByRole('button', { name: 'Cite', exact: true }).first().click();
        await page.locator('.cite-dialog[open]').waitFor();
        const citation = await page.locator('.cite-dialog code').textContent();
        await page.locator('.copy-citation').click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), citation);
        await page.screenshot({ path: path.join(output, `citation-${width}.png`), fullPage: true });
        await page.keyboard.press('Escape');
        assert.equal((await page.goto(unavailable)).status(), 502);
        await page.getByRole('alert').getByText('Search is temporarily unavailable.', { exact: false }).waitFor();
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, `search-unavailable-${width}.png`), fullPage: true });
        await context.close();
    }
    assert.deepEqual(unexpected, []);
    await writeFile(path.join(output, 'report.json'), JSON.stringify({ generatedHtml: generated, viewports: [1440, 375], journeys: ['metadata keyboard disclosures', 'citation focus return', 'table filtering and restored page size', 'numeric search state and query submission', 'clipboard citation contents', 'search-unavailable response'], pageErrors: errors, unexpectedRequests: unexpected, externalExclusions: ['EMBL chrome/styles', 'analytics', 'images/fonts', 'external file-browser document'] }, null, 2) + '\n');
    console.log(`Verified ${generated} generated HTML files and desktop/mobile browser journeys.`);
} finally {
    await browser?.close();
    if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill('SIGTERM'); await closed; }
}
