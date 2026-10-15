import { test as base, expect } from '@playwright/test';
import { fixtureResponse } from '../fixtures/website/responses.mjs';
export const test = base.extend<{ expectedHTTPFailures: string[] }>({
    expectedHTTPFailures: [[], { option: true }],
    page: async ({ page, context, baseURL, expectedHTTPFailures }, use) => {
        const errors: string[] = [], unexpected: string[] = [];
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === new URL(baseURL).origin) return route.continue();
            if (url.origin === 'https://alpha.bioimagearchive.org' || url.origin === 'https://www.ebi.ac.uk' && url.pathname.startsWith('/ebisearch/ws/rest/')) {
                try { return route.fulfill({ json: fixtureResponse(url.href) }); }
                catch (error) { unexpected.push(error.message); return route.abort(); }
            }
            if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ body: '', contentType: 'text/javascript' });
            if (url.origin === 'https://livingobjects.ebi.ac.uk' && url.pathname === '/bioimaging-01-pub/bia-filelist/bff/index.html') return route.fulfill({ body: '<!doctype html><title>External file browser excluded</title>', contentType: 'text/html' });
            if (['image', 'font'].includes(request.resourceType())) return route.fulfill({ status: 204 });
            if (['assets.emblstatic.net', 'ebi.emblstatic.net', 'www.embl.org'].includes(url.hostname)) return route.fulfill({ body: '', contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' });
            unexpected.push(request.url()); return route.abort();
        });

        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.url().startsWith(baseURL!) && !response.url().includes('/images?query=unavailable') && response.status() >= 400 && !expectedHTTPFailures.some(value => response.url().includes(value))) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
        page.on('requestfailed', request => { if (request.url().startsWith(baseURL!)) errors.push(`Failed request: ${request.url()}`); });
        page.on('dialog', async dialog => { errors.push(`Unexpected browser dialog: ${dialog.message()}`); await dialog.dismiss(); });
        await use(page);
        expect(errors, 'Application errors').toEqual([]);
        expect(unexpected, 'Unrecorded external requests').toEqual([]);
    },
});
export { expect };
