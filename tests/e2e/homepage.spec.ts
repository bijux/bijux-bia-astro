import assert from 'node:assert/strict';
import { test } from '../support/browser';

test('homepage preserves production behaviour', async ({ page }) => {
assert((await page.goto('/bioimage-archive/')).ok());
        await page.getByRole('heading', { name: 'BioImage Archive', exact: true }).waitFor();
        await page.locator('#live-tutorials').getByText('Currently there are no upcoming events', { exact: false }).waitFor();
        await page.locator('#ondemand-tutorials').getByText('Currently there are no upcoming events', { exact: false }).waitFor();
});
