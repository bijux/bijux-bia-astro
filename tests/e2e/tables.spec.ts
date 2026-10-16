import assert from 'node:assert/strict';
import { test } from '../support/browser';

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
