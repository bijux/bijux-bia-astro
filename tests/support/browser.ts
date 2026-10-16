import { test as base, expect } from '@playwright/test';
import { fixtureResponse } from '../fixtures/website/responses.mjs';
import { expectedBrowserCancellation, routeBrowserRequest } from './browser-network.mjs';
export const test = base.extend<{ expectedHTTPFailures: string[] }>({
    expectedHTTPFailures: [[], { option: true }],
    page: async ({ page, context, baseURL, browserName, expectedHTTPFailures }, use) => {
        const errors: string[] = [], unexpected: string[] = [];
        const origin = new URL(baseURL).origin;
        await context.route('**/*', route => routeBrowserRequest(route, { origin, fixtureResponse, unexpected }));

        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400 && !expectedHTTPFailures.some(value => response.url().includes(value))) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
        page.on('requestfailed', request => {
            if (new URL(request.url()).origin === origin && !expectedBrowserCancellation(request, browserName)) errors.push(`Failed request: ${request.url()}`);
        });
        page.on('dialog', async dialog => { errors.push(`Unexpected browser dialog: ${dialog.message()}`); await dialog.dismiss(); });
        await use(page);
        expect(errors, 'Application errors').toEqual([]);
        expect(unexpected, 'Unrecorded external requests').toEqual([]);
    },
});
export { expect };
