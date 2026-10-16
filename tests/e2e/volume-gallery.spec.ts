import { test, expect } from '../support/browser';
import images from '../../src/data/collections/vem_image_summaries.json' with { type: 'json' };

test('volume-EM views retain table state and deliberate button/panel geometry', { tag: '@preservation' }, async ({ page }) => {
    await page.goto('/bioimage-archive/galleries/volumeem');
    await page.locator('label:has(input[name="view"][value="table-view"])').click();
    await expect(page.locator('#table-view')).toBeVisible();
    await page.locator('label:has(input[name="view"][value="grid-view"])').click();
    await expect(page.locator('#grid-view')).toBeVisible();
    await page.locator('label:has(input[name="columns"][value="3"])').click();
    await expect.poll(() => page.locator('.grid-inner').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(/\s+/).length)).toBe(3);
    await page.locator('label:has(input[name="view"][value="table-view"])').click();
    await expect(page.locator('#table-view')).toBeVisible();
    await page.locator('label:has(input[name="view"][value="card-view"])').click();
    await expect(page.locator('#card-view .bia-button').first()).toHaveCSS('border-top-left-radius', '0px');
    await expect(page.locator('#card-view .size-bar').first()).toHaveCSS('border-top-left-radius', '4px');
});

test('volume-EM dialogs retain named, native copy and dismissal behaviour', { tag: '@preservation' }, async ({ page, browserName, nativeClipboardWrites }) => {
    await page.goto('/bioimage-archive/galleries/volumeem');
    const uri = 'https://bioimaging-01-pub.livingobjects.ebi.ac.uk/phase1test/EMPIAR-10311-IM1.zarr';
    const command = "aws s3 cp --no-sign-request --endpoint-url 'https://livingobjects.ebi.ac.uk' 's3://bioimaging-01-pub/phase1test/EMPIAR-10311-IM1.zarr' './EMPIAR-10311-IM1.zarr' --recursive";
    const opener = page.locator(`#card-view button[data-uri="${uri}"]`);
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'OME-Zarr S3 Location', exact: true });
    await expect(dialog.getByRole('heading', { name: 'OME-Zarr S3 Location', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy S3 URI', exact: true })).toHaveCSS('border-top-left-radius', '0px');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    for (const [label, value] of [['Copy S3 URI', uri], ['Copy AWS Command', command]]) {
        await page.keyboard.press('Enter');
        await expect(dialog.locator('pre')).toHaveText(command);
        await dialog.getByRole('button', { name: label, exact: true }).click();
        await expect.poll(() => nativeClipboardWrites.at(-1)).toBe(value);
        if (browserName === 'chromium') await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value);
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
    }
    expect(nativeClipboardWrites).toEqual([uri, command]);
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: async () => { throw new DOMException('Denied for this check', 'NotAllowedError'); },
    }));
    await page.keyboard.press('Enter');
    const copy = dialog.getByRole('button', { name: /^(Copy S3 URI|Copy unavailable)$/ });
    await copy.click();
    await expect(copy).toHaveText('Copy unavailable');
    await expect(copy).toBeEnabled();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'));
    await copy.click();
    await expect.poll(() => nativeClipboardWrites).toEqual([uri, command, uri]);
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
});


test('one gallery filter preserves matching identities across cards, grid and table without replacing native table search', { tag: '@preservation' }, async ({ page }) => {
    await page.goto('/bioimage-archive/galleries/volumeem');
    const filter = page.locator('#searchBox');
    const total = Object.keys(images).length;
    for (const query of ['hElA', 'Homo sapiens', 'FIB-SEM', 'No matching volume [.*]', '']) {
        const expected = Object.entries(images).filter(([, image]) => image.label.toLowerCase().includes(query.toLowerCase()) ||
            `${image.organism}, ${image.imaging_method}`.toLowerCase().includes(query.toLowerCase())).map(([uuid]) => uuid).sort();
        await filter.fill(query);
        await expect(page.locator('#visibleCount')).toHaveText(query ? String(expected.length) : 'all');
        await expect(page.locator('#totalCount')).toHaveText(String(total));
        for (const view of ['card-view', 'grid-view', 'table-view']) {
            await page.locator(`input[name="view"][value="${view}"]`).check();
            if (view === 'table-view') {
                const actual = await page.evaluate(() => window.jQuery('#table-view table').DataTable()
                    .rows({ search: 'applied' }).nodes().toArray().map(row => row.dataset.volumeId).sort());
                expect(actual).toEqual(expected);
            } else {
                const actual = await page.locator(`#${view} article:visible`).evaluateAll(nodes => nodes.map(node => node.dataset.volumeId).sort());
                expect(actual).toEqual(expected);
            }
        }
    }
    await filter.fill('HeLa');
    const tableSearch = page.locator('#table-view .dt-search input');
    await tableSearch.fill('No matching table record');
    await expect(page.locator('#table-view tbody')).toContainText('No matching records found');
    await filter.fill('Homo sapiens');
    await expect(tableSearch).toHaveValue('No matching table record');
    await expect(page.locator('#table-view tbody')).toContainText('No matching records found');
    await tableSearch.fill('');
    await expect.poll(() => page.locator('#table-view tbody tr[data-volume-id]').count()).toBeGreaterThan(0);
});
