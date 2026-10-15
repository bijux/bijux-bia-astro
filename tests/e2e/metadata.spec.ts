import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';
import contract from '../fixtures/website/production-contract.json' with { type: 'json' };

test('metadata preserves production behaviour', async ({ page }) => {
        assert((await page.goto(`/bioimage-archive${contract.study.path}`)).ok());
        const datasets = page.locator('.dataset-metadata');
        await expect(datasets.locator('.dataset-metadata__title')).toHaveText(contract.study.datasets.map(dataset => dataset.title));
        for (const [index, expected] of contract.study.datasets.entries()) {
            const dataset = datasets.nth(index);
            await expect(dataset.locator('.dataset-metadata__overview')).toContainText(`Number of images/files: ${expected.count}`);
            await expect(dataset.locator('.dataset-metadata__record > summary')).toHaveText(expected.records);
            await expect(dataset.locator('.dataset-metadata__record[open]')).toHaveCount(expected.openRecords);
        }
        await expect(datasets.first().locator(`a[href="${contract.study.taxonomyHref}"]`).first()).toBeAttached();
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
