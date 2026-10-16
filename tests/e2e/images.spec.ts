import { test, expect } from '../support/browser';
import { uncuratedImage, curatedImage } from '../fixtures/scenarios/image-representations.mjs';

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
