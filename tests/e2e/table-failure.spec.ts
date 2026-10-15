import { test, expect } from '../support/browser';

test('image table failures stop processing and leave an accessible explanation', async ({ page }) => {
    await page.route('**/search/v1/website/browse/image?**', route => route.fulfill({ status: 503, json: {} }));
    await page.goto('/bioimage-archive/study/EMPIAR-12104');
    await expect(page.getByRole('alert')).toHaveText('Images are temporarily unavailable. Please try again.');
    await expect(page.locator('#viewable_images_table_processing')).toBeHidden();
    await expect(page.locator('#showDisplayImagesToggle')).toBeEnabled();
    await expect(page.locator('label.switch')).toBeVisible();
});
