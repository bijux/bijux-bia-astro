import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';

test('spora preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/projects/spora/dataset')).ok());
        await page.getByRole('button', { name: 'Cite', exact: true }).first().click();
        await page.locator('.cite-dialog[open]').waitFor();
        const citation = await page.locator('.cite-dialog code').textContent();
        await page.locator('.copy-citation').click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), citation);
        await page.keyboard.press('Escape');
});

test('SPORA filters regenerate working download actions and clear to the original rows', async ({ page }) => {
    await page.goto('/bioimage-archive/projects/spora/dataset');
    const rows = page.locator('.browser tbody tr');
    const initial = await rows.count();
    const name = await rows.first().locator('strong').textContent();
    await page.locator('#dataset-search').fill(name!);
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const dialog = page.locator('.globus-dialog[open]');
    const command = await dialog.locator('code').textContent();
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(rows).toHaveCount(initial);
    await expect(page.locator('#dataset-search')).toHaveValue('');
    const cancer = page.locator('input[name="cancer"]').first();
    const selected = await cancer.inputValue();
    await cancer.check();
    await expect.poll(async () => (await rows.allTextContents()).every(text => text.includes(selected))).toBe(true);
    await page.locator('#dataset-search').fill('__no_matching_dataset__');
    await expect(rows).toHaveCount(0);
    await expect(page.locator('.browser .empty')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(rows).toHaveCount(initial);
});

test('clipboard rejection leaves the SPORA dialog usable and a retry copies the same command', async ({ page }) => {
    await page.goto('/bioimage-archive/projects/spora/dataset');
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: async () => { throw new DOMException('Denied for this check', 'NotAllowedError'); },
    }));
    const opener = page.getByRole('button', { name: 'Download', exact: true }).first();
    await opener.click();
    const dialog = page.locator('.globus-dialog[open]');
    const command = await dialog.locator('code').textContent();
    const copy = dialog.locator('.copy-commands');
    await copy.click();
    await expect(copy).toHaveText('Copy unavailable');
    await expect(copy).toBeEnabled(); await expect(dialog).toBeVisible();
    await expect(dialog.locator('code')).toHaveText(command!);
    await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'));
    await copy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
});
