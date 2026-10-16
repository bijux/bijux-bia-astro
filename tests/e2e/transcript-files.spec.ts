import type { Page } from '@playwright/test';
import { test, expect } from '../support/browser';
import { spatialomicsApiRoot, spatialomicsDatasets, spatialomicsFiles } from '../fixtures/website/spatialomics.mjs';

const path = '/bioimage-archive/galleries/spatialomics/study/S-BIAD1093';
const xenium = '858bbc76-2b48-490f-a1bf-fbafe07d8477';
const merscope = 'f7a58691-b3bc-4277-8d58-e7ae2b1ddccd';
const endpoint = `${spatialomicsApiRoot}/dataset/*/file_reference?*`;
const selectedIds = new Map([
    [xenium, ['17bfa258-d9fa-44d8-aede-c9efff19a483', '20f096e0-9b0a-4660-8d98-f03c7d2a6bbf', '271c5cf9-6fbd-49d7-96b1-f8078b28aa57',
        '2fccba2d-6854-409f-a025-78164396dba3', '33d92b1a-6ce8-42e7-ab2b-d4781838a533', '52b877ec-c820-4988-b074-c9b6e4c08311',
        '6d2cb336-5f7a-4913-ac8f-c298c178c4cc', '75cb065c-6aa2-46d7-b524-84e2555a243e', 'a9f8c602-d540-4dee-954d-ed9031240330',
        'c18b7f0f-3925-498c-8b5c-b9795a6be15b', 'd8727b76-c481-49aa-9f2e-2f7f3bf13991', 'f4eda877-d9ef-4588-a3c2-6fd83ed9a201']],
    [merscope, ['59146d22-a86c-4ac0-930c-07a3f2e4f620', '87624867-dc66-4a3d-a6d7-88c63cda0ed5', 'eb8b3b97-ba7c-487d-80d2-921285e259e8']],
]);
const tableRows = (page: Page) => page.locator('#sotables_file_references_table tbody tr');
const region = (page: Page) => page.getByRole('region', { name: 'Omics Component' });
const selector = (page: Page) => region(page).getByLabel('Dataset:', { exact: true });
async function checkFiles(page: Page, dataset: string) {
    await expect(region(page).locator('[data-file-table]')).toBeVisible();
    await expect(region(page).locator('[data-file-table]')).not.toHaveAttribute('aria-busy', 'true');
    const expected = spatialomicsFiles.get(dataset).filter(file => selectedIds.get(dataset).includes(file.uuid));
    await expect(tableRows(page)).toHaveCount(expected.length);
    const rows = await tableRows(page).evaluateAll(nodes => nodes.map(node => ({
        uuid: node.querySelector('td')?.textContent, name: node.querySelectorAll('td')[1]?.textContent,
        uri: node.querySelector('button')?.getAttribute('data-uri'),
    })));
    expect(rows.sort((a, b) => a.uuid.localeCompare(b.uuid))).toEqual(expected.map(file => ({ uuid: file.uuid, name: file.file_path, uri: file.uri }))
        .sort((a, b) => a.uuid.localeCompare(b.uuid)));
}

test('transcript inventories preserve dataset order, native controls and copy values without duplicate initial requests', { tag: '@preservation' }, async ({ page, nativeClipboardWrites, browserName }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.url().startsWith(spatialomicsApiRoot)) requests.push(request.url()); });
    await page.goto(path);
    await expect(selector(page)).toBeEnabled();
    await expect(selector(page).locator('option')).toHaveText(['Select a Dataset', 'Xenium and Confocal Reimaging', 'MERSCOPE']);
    expect(await selector(page).inputValue()).toBe(xenium);
    await checkFiles(page, xenium);
    expect(requests).toHaveLength(spatialomicsDatasets.length);
    expect(new Set(requests).size).toBe(spatialomicsDatasets.length);
    expect(requests.every(url => url.endsWith('file_reference?page_size=1000'))).toBe(true);
    await expect(page.locator('#transcript_files')).toHaveText('Omics Component');
    await selector(page).selectOption(merscope);
    await checkFiles(page, merscope);
    const copy = region(page).getByRole('button', { name: 'Copy Url', exact: true }).first();
    const uri = await copy.getAttribute('data-uri');
    await copy.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => nativeClipboardWrites.at(-1)).toBe(uri);
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(uri);
    await expect(copy).toHaveCSS('border-top-left-radius', '0px');
    await selector(page).selectOption(xenium);
    await checkFiles(page, xenium);
    expect(requests).toHaveLength(5);
});

test('failed dataset discovery is visible, retries only failures and retains the current dataset', async ({ page }) => {
    let fail = true;
    const calls: string[] = [];
    await page.route(endpoint, route => {
        const uuid = new URL(route.request().url()).pathname.split('/').at(-2)!;
        calls.push(uuid);
        return route.fulfill(uuid === xenium && fail ? { status: 503, json: {} } : { json: spatialomicsFiles.get(uuid) });
    });
    await page.goto(path);
    await expect(selector(page)).toHaveValue(merscope);
    await checkFiles(page, merscope);
    await expect(region(page).locator('[data-discovery-status]')).toContainText('Some datasets could not be checked');
    fail = false;
    await region(page).getByRole('button', { name: 'Retry dataset discovery' }).click();
    await expect(selector(page).locator('option')).toHaveCount(3);
    await expect(selector(page)).toHaveValue(merscope);
    await checkFiles(page, merscope);
    expect(calls.filter(uuid => uuid === xenium)).toHaveLength(2);
    expect(calls.filter(uuid => uuid === merscope)).toHaveLength(1);
    await expect(region(page).getByRole('button', { name: 'Retry dataset discovery' })).toBeHidden();
});

test('current file failures, empty inventories and retry remain distinct from successful discovery', async ({ page }) => {
    await page.goto(path);
    await checkFiles(page, xenium);
    let payload: unknown = { invalid: 'inventory' };
    await page.route(endpoint, route => route.fulfill({ json: payload }));
    await selector(page).selectOption(merscope);
    await expect(region(page).getByRole('button', { name: 'Retry files', exact: true })).toBeVisible();
    await expect(region(page).locator('[data-files-status]')).toContainText('temporarily unavailable');
    await expect(region(page).locator('[data-file-table]')).toBeHidden();
    await expect(selector(page)).toHaveValue(merscope);
    payload = [];
    await region(page).getByRole('button', { name: 'Retry files', exact: true }).click();
    await expect(region(page).locator('[data-files-status]')).toHaveText('No transcript files were returned for this dataset.');
    await expect(selector(page)).toBeFocused();
    await expect(region(page).getByRole('button', { name: 'Retry files', exact: true })).toBeHidden();
    payload = spatialomicsFiles.get(merscope);
    await selector(page).selectOption(xenium);
    await selector(page).selectOption(merscope);
    await checkFiles(page, merscope);
});

test('an older dataset request is cancelled and cannot replace the newly selected files', { tag: '@preservation' }, async ({ page }) => {
    await page.goto(path);
    await checkFiles(page, xenium);
    let release = () => {}, finished = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const settled = new Promise<void>(resolve => { finished = resolve; });
    let requested: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    await page.route(endpoint, async route => {
        const uuid = new URL(route.request().url()).pathname.split('/').at(-2)!;
        if (uuid !== merscope) return route.fulfill({ json: spatialomicsFiles.get(uuid) });
        requested(); await held;
        try { await route.fulfill({ status: 503, json: {} }); }
        finally { finished(); }
    });
    await selector(page).selectOption(merscope);
    await started;
    const cancelled = page.waitForEvent('requestfailed', request => request.url().includes(merscope));
    await selector(page).selectOption(xenium);
    await cancelled;
    await checkFiles(page, xenium);
    release();
    await settled;
    await expect(selector(page)).toHaveValue(xenium);
    await expect(region(page).locator('[data-files-status]')).toHaveText('');
    await checkFiles(page, xenium);
});

test('redrawn transcript controls preserve literal text, clipboard values and missing URLs', async ({ page, nativeClipboardWrites }) => {
    // Independent boundary records exercise paging/escaping absent from the complete captures.
    const special = { uuid: 'file-00', file_path: '<img src=x onerror=alert(1)> & literal', uri: 'https://example.org/file?name="quoted"&value=<literal>',
        additional_metadata: [{ name: 'attributes_from_biostudies.File', value: { attributes: { Data_Type: 'transcripts' } } }] };
    const files = Array.from({ length: 27 }, (_, index) => ({ ...special, uuid: `file-${String(index).padStart(2, '0')}`,
        ...(index === 26 ? { file_path: 'missing URL', uri: null } : {}) }));
    await page.route(endpoint, route => route.fulfill({ json: files }));
    await page.goto(path);
    await expect(tableRows(page)).toHaveCount(25);
    await expect(tableRows(page).first()).toContainText(special.file_path);
    await expect(region(page).locator('tbody img')).toHaveCount(0);
    const next = region(page).getByRole('link', { name: 'Next', exact: true });
    await next.click();
    await expect(tableRows(page)).toHaveCount(2);
    await expect(tableRows(page).last()).toContainText('URL not reported');
    await expect(tableRows(page).last().getByRole('button')).toHaveCount(0);
    const copy = tableRows(page).first().getByRole('button', { name: 'Copy Url', exact: true });
    await copy.focus(); await page.keyboard.press('Space');
    await expect.poll(() => nativeClipboardWrites.at(-1)).toBe(special.uri);
    const search = region(page).getByRole('searchbox');
    await search.fill('missing URL');
    await expect(tableRows(page)).toHaveCount(1);
    await expect(tableRows(page).first()).toContainText('file-26');
});

test('empty discovery remains distinct from unavailable datasets', async ({ page }) => {
    await page.route(endpoint, route => route.fulfill({ json: [] }));
    await page.goto(path);
    await expect(region(page).locator('[data-discovery-status]')).toHaveText('No transcript files were found in the returned dataset inventories.');
    await expect(selector(page)).toBeDisabled();
    await expect(region(page).getByRole('button', { name: /Retry/ })).toBeHidden();
});

test.describe('transcript files without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('the native section explains the unavailable interactive browser', async ({ page }) => {
        await page.goto(path);
        const explanation = region(page).locator('noscript p');
        await expect(explanation).toBeVisible();
        expect(await explanation.textContent()).toBe('Enable JavaScript to browse transcript files.');
        await expect(selector(page)).toBeDisabled();
        await expect(region(page).getByRole('heading', { name: 'Omics Component' })).toBeVisible();
    });
});
