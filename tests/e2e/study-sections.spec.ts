import { readFileSync } from 'node:fs';
import { test, expect } from '../support/browser';

const legacy = JSON.parse(readFileSync(new URL('../fixtures/api/study-s-biad546-response.json', import.meta.url), 'utf8')).hits.hits[0]._source;
const files = JSON.parse(readFileSync(new URL('../fixtures/api/file-links-s-biad546-response.json', import.meta.url), 'utf8'));

test('study navigation matches rendered dataset sections while legacy metadata and file access remain available', { tag: '@preservation' }, async ({ page }) => {
    await page.goto(`/bioimage-archive/study/${legacy.accession_id}`);
    await expect(page.getByRole('heading', { name: legacy.accession_id, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: legacy.title, exact: true })).toBeVisible();
    await expect(page.locator('#study')).toContainText(legacy.description);
    await expect(page.getByRole('link', { name: 'Datasets', exact: true })).toHaveCount(0);
    await expect(page.locator('#study_components')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Browse HTTP', exact: true })).toHaveAttribute('href', files.httpLink);
    await page.getByRole('link', { name: 'Study Information', exact: true }).click();
    await expect(page).toHaveURL(/#study$/);
    await expect(page.locator('#study')).toBeInViewport();
    await page.goto('/bioimage-archive/study/S-BIAD3335');
    await page.getByRole('link', { name: 'Datasets', exact: true }).click();
    await expect(page).toHaveURL(/#study_components$/);
    await expect(page.locator('#study_components')).toBeInViewport();
    await expect(page.locator('#study_components .dataset-metadata')).toHaveCount(2);
});
