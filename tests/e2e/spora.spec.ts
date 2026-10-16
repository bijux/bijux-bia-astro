import assert from 'node:assert/strict';
import catalogue from '../../src/data/collections/spora-datasets.json' with { type: 'json' };
import { test, expect } from '../support/browser';

const boundaryNames = ['constructor', '__proto__', 'toString'];

test('spora preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/projects/spora/dataset')).ok());
        await page.getByRole('button', { name: 'Cite', exact: true }).first().click();
        await page.getByRole('dialog', { name: 'Dataset citation', exact: true }).waitFor();
        const citation = await page.locator('.cite-dialog code').textContent();
        await page.locator('.copy-citation').click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), citation);
        await page.keyboard.press('Escape');
});

test('SPORA filters retain working download actions and clear to the original rows', async ({ page }) => {
    await page.goto('/bioimage-archive/projects/spora/dataset');
    const rows = page.locator('.browser tbody tr');
    const initial = await rows.count();
    const name = await rows.first().locator('strong').textContent();
    await page.locator('#dataset-search').fill(name!);
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Dataset download commands', exact: true });
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
    // Allow native disabling to blur the active control before rejection settles.
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            throw new DOMException('Denied for this check', 'NotAllowedError');
        },
    }));
    const opener = page.getByRole('button', { name: 'Download', exact: true }).first();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Dataset download commands', exact: true });
    const command = await dialog.locator('code').textContent();
    const copy = dialog.locator('.copy-commands');
    await copy.click();
    await expect(copy).toHaveText('Copy unavailable');
    await expect(copy).toBeEnabled();
    await expect(copy).toBeFocused();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('code')).toHaveText(command!);
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: () => new Promise<void>(resolve => document.addEventListener('finish-clipboard-check', () => resolve(), { once: true })),
    }));
    await copy.click();
    const close = dialog.locator('.dialog-actions [value="cancel"]');
    await expect(copy).toBeDisabled();
    await close.focus();
    await page.evaluate(() => document.dispatchEvent(new Event('finish-clipboard-check')));
    await expect(copy).toHaveText('Copied!');
    await expect(close).toBeFocused();
    await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'));
    await copy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
});

test.describe('SPORA server-rendered categories', () => {
    test.use({ javaScriptEnabled: false });
    test('the complete catalogue and unfamiliar category labels remain available without JavaScript', { tag: '@preservation' }, async ({ page }) => {
        await page.goto('/bioimage-archive/projects/spora/dataset');
        await expect(page.locator('.browser tbody tr strong')).toHaveText([...catalogue.map(dataset => dataset.name), ...boundaryNames.map(name => `Category ${name}`)]);
        for (const name of boundaryNames) {
            const option = page.locator(`input[name="type"][value="${name}"]`).locator('..');
            await expect(option.locator('span').first()).toHaveText(name);
            await expect(option.locator('.facet-count')).toHaveText('1');
        }
        await expect(page.locator('input[name="type"][value="ROI"]').locator('..').locator('span').first()).toHaveText('Region of Interest (ROI)');
    });
});

test('filtered rows preserve unknown category text and their server-rendered controls', { tag: '@preservation' }, async ({ page }) => {
    await page.goto('/bioimage-archive/projects/spora/dataset');
    const rows = page.locator('.browser tbody tr');
    const retained = await rows.last().elementHandle();
    for (const name of boundaryNames) {
        await page.locator(`input[name="type"][value="${name}"]`).check();
        await expect(rows).toHaveCount(1);
        await expect(rows.locator('strong')).toHaveText(`Category ${name}`);
        for (const index of [3, 4]) {
            const badge = rows.locator('td').nth(index).locator('span');
            await expect(badge).toHaveText(name);
            await expect(badge).toHaveAttribute('class', 'pill');
        }
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(rows.locator('strong')).toHaveText([...catalogue.map(dataset => dataset.name), ...boundaryNames.map(name => `Category ${name}`)]);
        expect(await rows.last().evaluate((row, original) => row === original, retained)).toBe(true);
    }
});
