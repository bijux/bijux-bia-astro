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


test('navigation closes with Escape and retains visible focus across viewport changes', { tag: '@preservation' }, async ({ page, browserName }) => {
    // Safari on macOS uses Option-Tab to include links in keyboard traversal.
    const next = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    const previous = next === 'Alt+Tab' ? 'Alt+Shift+Tab' : 'Shift+Tab';
    await page.goto('/bioimage-archive/studies');
    const nav = page.getByRole('navigation', { name: 'Primary', exact: true });
    const toggle = nav.getByRole('button', { name: 'Toggle navigation' });
    const browse = nav.getByRole('link', { name: 'Browse', exact: true });
    const studies = nav.getByRole('link', { name: 'Studies', exact: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await browse.focus();
    await expect(studies).toBeVisible();
    await page.keyboard.press(next);
    await expect(studies).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(browse).toBeFocused();
    await expect(studies).toBeHidden();
    await page.keyboard.press(next);
    await expect(nav.getByRole('link', { name: 'Submit', exact: true })).toBeFocused();
    await page.keyboard.press(previous);
    await expect(studies).toBeVisible();

    await page.setViewportSize({ width: 375, height: 1000 });
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-controls', 'primary-navigation-list');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(browse).toBeHidden();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await studies.focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(studies).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(studies).toBeVisible();
    await page.getByRole('searchbox').first().click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('searchbox').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await toggle.focus();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeFocused();
    await expect(toggle).toBeHidden();
    await page.evaluate(() => document.dispatchEvent(new Event('astro:page-load')));
    await page.setViewportSize({ width: 375, height: 1000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(studies).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await nav.evaluate(element => {
        const menu = element.querySelector('#primary-navigation-list')!.getBoundingClientRect();
        return menu.top >= element.getBoundingClientRect().bottom - 1;
    })).toBe(true);
});

test.describe('navigation without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('mobile navigation retains all native links without an inert toggle', { tag: '@preservation' }, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 1000 });
        for (const [path, label, link] of [
            ['/help/search', 'Primary', 'Downloading Data'],
            ['/projects/spora', 'spora primary', 'Dataset Browser'],
        ]) {
            await page.goto(`/bioimage-archive${path}`);
            const nav = page.getByRole('navigation', { name: label, exact: true });
            await expect(nav.getByRole('button', { name: 'Toggle navigation', includeHidden: true })).toBeHidden();
            const destination = nav.getByRole('link', { name: link, exact: true });
            await expect(destination).toBeVisible();
            await destination.focus();
            await expect(destination).toBeFocused();
            expect(await nav.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
            await destination.press('Enter');
            await expect(page).toHaveURL(new RegExp(path.startsWith('/projects') ? '/projects/spora/dataset/?$' : '/help/downloading-data/?$'));
        }
    });
});
