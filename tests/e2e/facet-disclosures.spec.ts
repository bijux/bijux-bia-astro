import { test, expect, tabNavigationKeys } from '../support/browser';

test('native facet disclosures announce state without changing hidden selections or submitting the form', { tag: '@preservation' }, async ({ page, browserName }) => {
    const { next, previous } = tabNavigationKeys(browserName);
    await page.goto('/bioimage-archive/images?size_t=1');
    const toggle = page.getByRole('button', { name: 'Time Steps', exact: true });
    const options = page.locator('[id="facet-option-size_t"]');
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('aria-controls', 'facet-option-size_t');
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(options).toBeHidden();
    await toggle.focus();
    await page.keyboard.press(next);
    await page.keyboard.press(previous);
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeFocused();
    await expect(options).toBeVisible();
    await expect(toggle).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(options).toBeHidden();
    expect(await page.locator('#facets').evaluate(form => new FormData(form as HTMLFormElement).getAll('size_t'))).toEqual(['1']);
    await page.keyboard.press(next);
    expect(await options.evaluate(element => element.contains(document.activeElement))).toBe(false);
    await expect(page).toHaveURL(/\/images\?size_t=1$/);
});

test.describe('native filtering without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('open groups retain their selections and the native form applies additional numeric filters', { tag: '@preservation' }, async ({ page }) => {
        await page.goto('/bioimage-archive/images?size_t=1');
        await expect(page.getByRole('button', { name: 'Time Steps', exact: true })).toBeDisabled();
        const options = page.locator('[id="facet-option-size_t"]');
        await expect(options).toBeVisible();
        await expect(options.locator('input[value="1"]')).toBeChecked();
        await options.locator('input[value="2-10"]').check();
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
        await expect(page).toHaveURL(/size_t=2-10/);
        const selected = new URL(page.url()).searchParams.getAll('size_t');
        expect(selected).toEqual(['1', '2-10']);
        await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
        await expect(page.locator('input[name="size_t"][value="2-10"]')).toBeChecked();
    });
});
