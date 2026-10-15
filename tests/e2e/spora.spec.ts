import assert from 'node:assert/strict';
import { test } from '../support/browser';

test('spora preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/projects/spora/dataset')).ok());
        await page.getByRole('button', { name: 'Cite', exact: true }).first().click();
        await page.locator('.cite-dialog[open]').waitFor();
        const citation = await page.locator('.cite-dialog code').textContent();
        await page.locator('.copy-citation').click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), citation);
        await page.keyboard.press('Escape');
});
