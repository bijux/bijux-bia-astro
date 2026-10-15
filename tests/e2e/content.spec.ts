import { test, expect } from '../support/browser';
import contract from '../fixtures/website/production-contract.json' with { type: 'json' };

test('public routes retain their rendering mode, headings, redirects and base-path links', async ({ page, request }) => {
    for (const route of contract.serverRoutes) {
        expect((await request.get(`/bioimage-archive${route}`)).status(), route).toBe(200);
    }
    for (const [path, heading] of [['/help/downloading-data', 'Downloading data'], ['/help/search', 'Searching the BioImage Archive'], ['/contact-us', 'Contact us'], ['/case-studies', 'Case Studies']]) {
        expect((await page.goto(`/bioimage-archive${path}`))?.status()).toBe(200);
        await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
        await expect(page.locator('a[href="/bioimage-archive/"]').first()).toBeAttached();
    }
    await page.goto(`/bioimage-archive${contract.redirect.path}`);
    await expect(page).toHaveURL(new RegExp(`${contract.redirect.destination}/?$`));
});

test('news navigation changes the visible article and training failures stay readable', async ({ page }) => {
    await page.route('**/ebisearch/ws/rest/ebiweb_training_events?**', route => route.fulfill({ status: 503, json: {} }));
    await page.goto('/bioimage-archive/');
    await expect(page.locator('#live-tutorials')).toContainText('Training events are temporarily unavailable.');
    const first = await page.locator('.news-article:visible h3').textContent();
    await page.locator('.news-article:visible .slider-right-button').click();
    await expect(page.locator('.news-article:visible h3')).not.toHaveText(first!);
    await page.locator('.news-article:visible .slider-left-button').click();
    await expect(page.locator('.news-article:visible h3')).toHaveText(first!);
});
