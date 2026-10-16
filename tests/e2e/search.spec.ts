import assert from 'node:assert/strict';
import { test, expect } from '../support/browser';
import studies from '../fixtures/api/browse-study-response.json' with { type: 'json' };
import images from '../fixtures/api/browse-image-response.json' with { type: 'json' };

test('search preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/images?size_t=1')).ok());
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#pageSize').selectOption('30');
        await page.waitForURL('**/*pagination.page_size=30*');
        assert(await page.locator('input[name="size_t"][value="1"]').isChecked());
        await page.locator('#pageSize').selectOption('60');
        await expect(page).toHaveURL(/pagination.page_size=60/);
        await page.goBack();
        await expect(page.locator('#pageSize')).toHaveValue('30');
        await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
        await page.goForward();
        await expect(page.locator('#pageSize')).toHaveValue('60');
        await page.locator('#searchitem').fill('nuclei');
        await Promise.all([page.waitForURL('**/*query=nuclei*'), page.locator('#searchitem').press('Enter')]);
        await page.locator('#selected-facets').getByText('nuclei', { exact: false }).waitFor();
        assert.equal(await page.locator('#searchitem').inputValue(), 'nuclei');
});

test('cursor-window history restores rows and labels through back, forward and reload', async ({ page }) => {
    await page.goto('/bioimage-archive/images?query=cursor-example&size_t=1&pagination.page=833');
    const label = page.locator('#paginated-results');
    const next = page.locator('.vf-pagination__item--next-page a');
    await expect(label).toHaveText('9985 - 9996 of 10050 results');
    await next.click();
    await expect(label).toHaveText('9997 - 10008 of 10050 results');
    await next.click();
    await expect(label).toHaveText('10009 - 10020 of 10050 results');
    expect(new URL(page.url()).searchParams.has('cursor')).toBe(false);
    await page.goBack();
    await expect(label).toHaveText('9997 - 10008 of 10050 results');
    await page.goForward();
    await expect(label).toHaveText('10009 - 10020 of 10050 results');
    await page.reload();
    await expect(label).toHaveText('10009 - 10020 of 10050 results');
    await expect(page.locator('input[name="size_t"][value="1"]')).toBeChecked();
});

test('study search retains distinct scientific names when common names are absent', async ({ page }) => {
    await page.goto('/bioimage-archive/studies?query=taxon-example');
    await expect(page.locator('#card-view')).toContainText('Mus musculus');
    await expect(page.locator('#card-view')).toContainText('Homo sapiens');
});

test('study and image result links survive empty highlights in cards and tables', async ({ page }) => {
    for (const [scope, destination] of [
        ['studies', `/bioimage-archive/study/${studies.hits.hits[0]._source.accession_id}`],
        ['images', `/bioimage-archive/image/${images.hits.hits[0]._source.uuid}`],
    ]) {
        await page.goto(`/bioimage-archive/${scope}?query=empty-highlights`);
        await expect(page.locator('#card-view .vf-card__heading a').first()).toHaveAttribute('href', destination);
        await expect(page.locator('#table-view tbody tr a').first()).toHaveAttribute('href', destination);
    }
});

test('physical filter labels preserve zero and very small values without changing their selected tokens', async ({ page }) => {
    const values = ['>0', '>1e-15'];
    const query = new URLSearchParams(values.map(value => ['total_physical_size_x', value]));
    await page.goto(`/bioimage-archive/images?${query}`);
    for (const [value, label] of [['>0', '> 0 m'], ['>1e-15', '> 1e-15 m']]) {
        await expect(page.locator(`input[name="total_physical_size_x"][value="${value}"]`)).toBeChecked();
        await expect(page.locator('#selected-facets .facet-value').getByText(label, { exact: true })).toBeAttached();
    }
    await page.locator('#pageSize').selectOption('30');
    await expect(page.locator('#pageSize')).toHaveValue('30');
    expect(new URL(page.url()).searchParams.getAll('total_physical_size_x')).toEqual(values);
});


test('query headings retain reserved characters when followed on either search endpoint', async ({ page }) => {
    const query = 'ATP & RNA+DNA #1';
    for (const scope of ['images', 'studies']) {
        await page.goto(`/bioimage-archive/${scope}?${new URLSearchParams({ query })}`);
        const link = page.getByRole('heading').getByRole('link', { name: query, exact: true });
        const destination = new URL((await link.getAttribute('href'))!, page.url());
        expect([...destination.searchParams]).toEqual([['query', query]]);
        expect(destination.hash).toBe('');
        await link.click();
        await expect(page.locator('#searchitem')).toHaveValue(query);
        expect(new URL(page.url()).searchParams.get('query')).toBe(query);
    }
});
