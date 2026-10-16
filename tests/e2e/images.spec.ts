import { test, expect } from '../support/browser';
import { uncuratedImage, curatedImage } from '../fixtures/scenarios/image-representations.mjs';
import { imageWithFileMetadata, imageWithoutViewer } from '../fixtures/scenarios/image-file-metadata.mjs';

test('images without a viewer retain their supplied file paths and user metadata', async ({ page }) => {
    await page.goto(`/bioimage-archive/image/${imageWithoutViewer.uuid}`);
    await expect(page.locator('iframe[name="vizarr"]')).toHaveCount(0);
    await expect(page.locator('#CopyURLButton')).toHaveCount(0);
    await expect(page.locator('#file-path-visible')).toContainText('sample/a.tif, sample/b.tif');
    await page.locator('#file-path-toggle').click();
    await expect(page.locator('#file-path-extra')).toContainText('sample/c.tif, sample/d.tif');
    await page.locator('#meta-toggle').click();
    await expect(page.locator('#meta-content')).toContainText('Supplied value 40');
    expect(await page.locator('#meta-content').evaluate(element => element.clientHeight >= element.scrollHeight)).toBe(true);
});

test.describe('image metadata without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('all supplied metadata and file paths remain readable', async ({ page }) => {
        await page.goto(`/bioimage-archive/image/${imageWithoutViewer.uuid}`);
        await expect(page.locator('#file-path-extra')).toBeVisible();
        await expect(page.locator('#file-path-extra')).toContainText('sample/d.tif');
        await expect(page.locator('#file-path-toggle')).toBeHidden();
        await expect(page.locator('#meta-toggle')).toBeHidden();
        await expect(page.locator('#meta-content')).toContainText('Supplied value 40');
        expect(await page.locator('#meta-content').evaluate(element => element.clientHeight >= element.scrollHeight)).toBe(true);
    });
});

test('long image metadata and extra file paths expand independently with the keyboard', async ({ page }) => {
    await page.goto(`/bioimage-archive/image/${imageWithFileMetadata.uuid}`);
    const toggle = page.locator('#meta-toggle');
    const content = page.locator('#meta-content');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-controls', 'meta-content');
    expect(await content.evaluate(element => element.clientHeight < element.scrollHeight)).toBe(true);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toContainText('Supplied value 40');
    expect(await content.evaluate(element => element.clientHeight >= element.scrollHeight)).toBe(true);
    await page.evaluate(() => document.dispatchEvent(new Event('astro:page-load')));
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#file-path-toggle').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#file-path-extra')).toBeVisible();
    await expect(page.locator('#file-path-extra')).toContainText('sample/d.tif');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#file-path-extra')).toBeVisible();
});

test('search views and the image viewer skip absent representation IDs and retain the OME-Zarr fallback', async ({ page }) => {
    await page.goto('/bioimage-archive/images?query=representation-boundary');
    await expect(page.locator('#card-view').getByText('222 x 100 px', { exact: true })).toBeVisible();
    await expect(page.locator('#table-view tbody tr').first()).toContainText('222 x 100 px');
    await page.goto(`/bioimage-archive/image/${uncuratedImage.uuid}`);
    const iframe = page.locator('iframe[name="vizarr"]');
    await expect(iframe).toBeAttached();
    const source = await iframe.getAttribute('src');
    expect(source).toBeTruthy();
    expect(new URL(source!).searchParams.get('source')).toBe('https://example.org/fallback.ome.zarr');
    await page.locator('#CopyURLButton').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.org/fallback.ome.zarr');
    await expect(page.getByRole('link', { name: 'Open in ITK viewer', exact: true })).toHaveCount(0);
    await page.goto(`/bioimage-archive/galleries/spatialomics/image/${uncuratedImage.uuid}`);
    await expect(page.locator('iframe[name="vizarr"]')).toHaveCount(0);
});

test('search recommendations and curated image overrides retain the selected representation', async ({ page }) => {
    await page.goto('/bioimage-archive/images?query=recommended-representation');
    await expect(page.locator('#card-view').getByText('444 x 100 px', { exact: true })).toBeVisible();
    await expect(page.locator('#table-view tbody tr').first()).toContainText('444 x 100 px');
    await page.goto(`/bioimage-archive/image/${curatedImage.uuid}`);
    const source = await page.locator('iframe[name="vizarr"]').getAttribute('src');
    expect(source).toBeTruthy();
    expect(new URL(source!).searchParams.get('source')).toBe('https://example.org/curated.ome.zarr');
    await page.locator('#CopyURLButton').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.org/curated.ome.zarr');
});
