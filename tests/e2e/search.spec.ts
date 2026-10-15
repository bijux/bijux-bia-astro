import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';

test('search preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/images?size_t=1')).ok());
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#pageSize').selectOption('30');
        await page.waitForURL('**/*pagination.page_size=30*');
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#pageSize').selectOption('60');
        await expect(page).toHaveURL(/pagination.page_size=60/);
        await page.goBack();
        await expect(page.locator('#pageSize')).toHaveValue('30');
        await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
        await page.goForward();
        await expect(page.locator('#pageSize')).toHaveValue('60');
        await page.locator('#searchitem').fill('nuclei');
        await Promise.all([page.waitForURL('**/*query=nuclei*'), page.locator('#searchitem').press('Enter')]);
        await page.locator('#selected-facets').getByText('nuclei', { exact: false }).waitFor();
        assert.equal(await page.locator('#searchitem').inputValue(), 'nuclei');
});
