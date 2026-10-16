import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';
import { fixtureResponse } from '../fixtures/website/responses.mjs';

test('tables preserves production behaviour', { tag: '@preservation' }, async ({ page }) => {
assert((await page.goto('/bioimage-archive/study/EMPIAR-12104')).ok());
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
});


test('dynamic file paths retain literal text, wrapping and keyboard disclosure after redraw', { tag: '@preservation' }, async ({ page }) => {
    const paths = ['sample/' + 'a'.repeat(160) + '.tif', '<img src=x onerror=alert(1)> & β.tif', 'third/🧬.tif', 'fourth.tif'];
    await page.route('**/website/browse/image?**', async route => {
        const response = fixtureResponse(route.request().url());
        response.hits.hits[0]._source.label = paths;
        response.hits.hits[0]._source.total_size_in_bytes = null;
        response.hits.hits[1]._source.total_size_in_bytes = 0;
        await route.fulfill({ json: response });
    });
    await page.goto('/bioimage-archive/study/EMPIAR-12104');
    const row = page.locator('#viewable_images_table tbody tr').first();
    const pathsCell = row.locator('td').nth(2);
    await expect(pathsCell.locator('.file-path')).toHaveCSS('overflow-wrap', 'anywhere');
    await expect(pathsCell.locator('.file-path')).toHaveCSS('white-space', 'normal');
    await expect(pathsCell).toContainText(paths[0]);
    await expect(pathsCell).toContainText(paths[1]);
    await expect(pathsCell.locator('img')).toHaveCount(0);
    await expect(row.locator('td').nth(4)).toHaveText('Unknown');
    await expect(page.locator('#viewable_images_table tbody tr').nth(1).locator('td').nth(4)).toHaveText('0.00 B');
    const button = pathsCell.getByRole('button', { name: 'Expand', exact: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(pathsCell.locator('.file-path-extra')).toBeHidden();
    await button.focus();
    await page.keyboard.press('Space');
    const collapse = pathsCell.getByRole('button', { name: 'Collapse', exact: true });
    await expect(collapse).toBeFocused();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(pathsCell.locator('.file-path-extra')).toContainText(paths[2]);
    await expect(pathsCell.locator('.file-path-extra')).toContainText(paths[3]);
    await page.keyboard.press('Enter');
    await expect(pathsCell.locator('.file-path-extra')).toBeHidden();
    await page.locator('select[aria-controls="viewable_images_table"]').selectOption('25');
    await expect(page.locator('#viewable_images_table tbody tr')).toHaveCount(25);
    await expect(pathsCell.locator('.file-path')).toHaveCSS('overflow-wrap', 'anywhere');
    await pathsCell.getByRole('button', { name: 'Expand', exact: true }).click();
    await expect(pathsCell.locator('.file-path-extra')).toBeVisible();
});
