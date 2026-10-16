import { test, expect } from '../support/browser';
import { uncuratedImage } from '../fixtures/scenarios/image-representations.mjs';

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
});
