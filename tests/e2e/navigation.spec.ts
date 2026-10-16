import { readFileSync } from 'node:fs';
import navigationContract from '../fixtures/website/navigation-contract.json' with { type: 'json' };
import { test, expect, tabNavigationKeys } from '../support/browser';

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
    const { next, previous } = tabNavigationKeys(browserName);
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


test('section navigation retains its captured groups, destinations and current-page emphasis', { tag: '@preservation' }, async ({ page }) => {
    for (const section of navigationContract.sections) {
        for (const suffix of ['', '/']) {
            await page.goto(`/bioimage-archive${section.path}${suffix}`);
            const nav = page.getByRole('navigation', { name: section.label, exact: true });
            const expected = section.groups.flat();
            await expect(nav.locator('ul')).toHaveCount(section.groups.length);
            await expect(nav.getByRole('link')).toHaveText(expected.map(link => link.label));
            expect(await nav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))))
                .toEqual(expected.map(link => link.href));
            const current = nav.locator('[aria-current="page"]');
            await expect(current).toHaveCount(1);
            await expect(current).toHaveText(section.current);
            await expect(current).toHaveCSS('font-weight', '700');
        }
        await page.getByRole('navigation', { name: section.label, exact: true })
            .getByRole('link', { name: section.follow.label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/bioimage-archive${section.follow.path}/?$`));
        await expect(page.getByRole('navigation', { name: section.label, exact: true }).locator('[aria-current="page"]'))
            .toHaveText(section.follow.label);
    }
});

test('breadcrumbs retain parent destinations and identify the current page in a native list', { tag: '@preservation' }, async ({ page }) => {
    const study = JSON.parse(readFileSync(new URL('../fixtures/api/study-s-biad3335-response.json', import.meta.url), 'utf8')).hits.hits[0]._source;
    for (const entry of [
        { path: '/projects/spora/dataset', title: 'Dataset Browser',
            parents: ['bioimage-archive', 'projects', 'spora'],
            hrefs: ['/bioimage-archive', '/bioimage-archive/projects', '/bioimage-archive/projects/spora'],
            follow: 'spora', destination: '/projects/spora', nextTitle: 'spora' },
        { path: '/study/S-BIAD3335', title: `${study.accession_id}: ${study.title}`,
            parents: ['bioimage-archive', 'studies'], hrefs: ['/bioimage-archive', '/bioimage-archive/studies'],
            follow: 'studies', destination: '/studies', nextTitle: 'Browse Studies' },
    ]) {
        await page.goto(`/bioimage-archive${entry.path}`);
        const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
        await expect(nav.getByRole('list')).toHaveCount(1);
        await expect(nav.getByRole('listitem')).toHaveCount(entry.parents.length + 1);
        await expect(nav.getByRole('link')).toHaveText(entry.parents);
        expect(await nav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(entry.hrefs);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(entry.title);
        await expect(nav.locator('[aria-current="page"]').getByRole('link')).toHaveCount(0);
        await nav.getByRole('link', { name: entry.follow, exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`/bioimage-archive${entry.destination}/?$`));
        await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).locator('[aria-current="page"]'))
            .toHaveText(entry.nextTitle);
    }
});
