import { test, expect } from '../support/browser';

test.use({ expectedHTTPFailures: ['pagination.page_size=30'] });
test('a superseded request is cancelled and cannot replace newer search results', async ({ page }) => {
    await page.goto('/bioimage-archive/images?size_t=1');
    let release = () => {}, markStarted = () => {}, markFinished = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const settled = new Promise<void>(resolve => { markFinished = resolve; });
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    await page.route('**/bioimage-archive/images?**', async route => {
        if (new URL(route.request().url()).searchParams.get('pagination.page_size') !== '30') return route.continue();
        markStarted();
        await held;
        try { await route.fulfill({ status: 503, body: 'Controlled superseded failure.' }); }
        finally { markFinished(); }
    });
    await page.locator('#pageSize').selectOption('30');
    await started;
    const cancelled = page.waitForEvent('requestfailed', request => new URL(request.url()).searchParams.get('pagination.page_size') === '30');
    await page.locator('#pageSize').selectOption('60');
    expect((await cancelled).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect(page).toHaveURL(/pagination.page_size=60/);
    release();
    await settled;
    await expect(page).toHaveURL(/pagination.page_size=60/);
    await expect(page.locator('#pageSize')).toHaveValue('60');
    await page.reload();
    await expect(page.locator('#pageSize')).toHaveValue('60');
    await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
});
