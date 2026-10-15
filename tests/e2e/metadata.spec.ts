import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';

test('metadata preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/study/S-BIAD3335')).ok());
        const disclosure = page.locator('.dataset-metadata__record summary').first();
        const details = disclosure.locator('..');
        const before = await details.getAttribute('open');
        await disclosure.focus(); await page.keyboard.press('Space');
        assert.notEqual(await details.getAttribute('open'), before);
        await page.keyboard.press('Enter');
        assert.equal(await details.getAttribute('open'), before);
        await page.locator('#open-cite-dialog').focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#cite-dialog').evaluate(element => element instanceof HTMLDialogElement && element.open));
        await page.keyboard.press('Escape');
        assert(await page.locator('#open-cite-dialog').evaluate(element => element === document.activeElement));
        await page.locator('[data-view="tree"]').click();
        await expect(page.locator('[data-view="tree"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#file-list-tree-viewer')).toHaveClass(/is-active/);
        await page.locator('[data-view="table"]').click();
        await expect(page.locator('[data-view="table"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#file-list-table-viewer')).toHaveClass(/is-active/);
});
