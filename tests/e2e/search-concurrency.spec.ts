import { test, expect } from '../support/browser';

test.use({ expectedHTTPFailures: ['pagination.page_size=30'] });
test('a failed superseded request cannot replace newer search results', async ({ page }) => {
    await page.goto('/bioimage-archive/images?size_t=1');
    let release = () => {}, markStarted = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    await page.route('**/bioimage-archive/images?**', async route => {
        if (new URL(route.request().url()).searchParams.get('pagination.page_size') !== '30') return route.continue();
        markStarted();
        await held;
        await route.fulfill({ status: 503, body: 'Controlled superseded failure.' });
    });
    await page.locator('#pageSize').selectOption('30');
    await started;
    await page.locator('#pageSize').selectOption('60');
    await expect(page).toHaveURL(/pagination.page_size=60/);
    const finished = page.waitForEvent('requestfinished', request => new URL(request.url()).searchParams.get('pagination.page_size') === '30');
    release();
    await finished;
    await expect(page).toHaveURL(/pagination.page_size=60/);
    await expect(page.locator('#pageSize')).toHaveValue('60');
    await page.reload();
    await expect(page.locator('#pageSize')).toHaveValue('60');
    await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
});
