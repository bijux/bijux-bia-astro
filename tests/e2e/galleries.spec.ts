import { test, expect } from '../support/browser';

test('image and spatialomics routes preserve metadata and study destinations', async ({ page }) => {
    const uuid = '001b8ef2-7a5e-4b94-b91c-d93f5095ee39';
    for (const prefix of ['/image/', '/galleries/spatialomics/image/']) {
        const response = await page.goto(`/bioimage-archive${prefix}${uuid}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('link', { name: 'Study Page', exact: true })).toHaveAttribute('href', prefix === '/image/' ? '/bioimage-archive/study/EMPIAR-12104' : '/bioimage-archive/galleries/spatialomics/study/EMPIAR-12104');
    }
});

test('annotation changes stay in their dataset and retain viewer/copy destinations', { tag: '@preservation' }, async ({ page, browserName, nativeClipboardWrites }) => {
    await page.goto('/bioimage-archive/galleries/ai/image/00000000-0000-4000-8000-000000000001');
    const first = page.locator('[data-annotation-dataset="annotation-dataset-2"]');
    const second = page.locator('[data-annotation-dataset="annotation-dataset-3"]');
    await expect(first.locator('[data-annotation-method]')).toHaveText('Independent method 2');
    await page.locator('#CopyAnnotationButton').click();
    await expect.poll(() => nativeClipboardWrites.at(-1)).toBe('https://example.org/annotation-2.ome.zarr');
    await page.locator('.slider-right-button').click();
    await expect(page.locator('#AnnotatedImageLength')).toHaveText('2');
    await expect(first.locator('[data-annotation-method]')).toHaveText('Independent method 2');
    await expect(second.locator('[data-annotation-method]')).toHaveText('Independent method 3');
    await expect(page.locator('#OpenAnnotationInVizarr')).toHaveAttribute('href', /annotation-3/);
    await page.locator('#CopyAnnotationButton').click();
    await expect.poll(() => nativeClipboardWrites.at(-1)).toBe('https://example.org/annotation-3.ome.zarr');
    expect(nativeClipboardWrites).toEqual(['https://example.org/annotation-2.ome.zarr', 'https://example.org/annotation-3.ome.zarr']);
    if (browserName === 'chromium') await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.org/annotation-3.ome.zarr');
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    expect(new Set(ids).size).toBe(ids.length);
});

test('AI model tables retain their model navigation and initialise', async ({ page }) => {
    await page.goto('/bioimage-archive/galleries/ai/model/loyal-squid');
    await expect(page.getByRole('heading', { name: 'Model Information', exact: true })).toBeVisible();
    await expect(page.locator('#model_prediction_table_wrapper')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Link to model', exact: true })).toHaveAttribute('href', /^https:/);
});
