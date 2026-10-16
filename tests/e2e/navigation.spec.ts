import { test, expect } from '../support/browser';

test('primary navigation identifies one current page with canonical and slash URLs', { tag: '@preservation' }, async ({ page }) => {
    for (const [path, label] of [
        ['/studies', 'Studies'], ['/studies/', 'Studies'],
        ['/projects/spora', 'spora'], ['/projects/spora/dataset/', 'Dataset Browser'],
        ['/help/search/', 'Searching Data'],
    ]) {
        await page.goto(`/bioimage-archive${path}`);
        const nav = page.locator('nav.navbar');
        const current = nav.locator('[aria-current="page"]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveText(label);
        await expect(current).toHaveClass(/is-current/);
        await expect(current.locator('xpath=ancestor::li[contains(@class,"nav-item")]')).toHaveClass(/is-active/);
        await expect(nav).toHaveAttribute('aria-label', path.startsWith('/projects') ? 'spora primary' : 'Primary');
    }
});
