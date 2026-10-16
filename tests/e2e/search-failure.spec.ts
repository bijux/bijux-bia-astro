import assert from 'node:assert/strict';
import { test } from '../support/browser';

test.use({ expectedHTTPFailures: ['/bioimage-archive/images?query=unavailable'] });
test('search-failure preserves production behaviour', async ({ page }) => {
assert.equal((await page.goto('/bioimage-archive/images?query=unavailable')).status(), 502);
        await page.getByRole('alert').getByText('Search is temporarily unavailable.', { exact: false }).waitFor();
});
