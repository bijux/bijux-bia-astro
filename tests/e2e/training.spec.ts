import { readFileSync } from 'node:fs';
import { test, expect } from '../support/browser';

const saved = JSON.parse(readFileSync(new URL('../fixtures/api/training-on-demand-response.json', import.meta.url), 'utf8'));
const live = '**/ebisearch/ws/rest/ebiweb_training_events?**';
const ondemand = '**/ebisearch/ws/rest/ebiweb_training_online?**';

test('homepage and help training cards preserve titles, links, type and decoded descriptions', { tag: '@preservation' }, async ({ page }) => {
    for (const route of ['', 'help']) {
        await page.goto(`/bioimage-archive/${route}`);
        const training = page.getByRole('region', { name: 'Training', exact: true });
        const section = training.getByRole('region', { name: 'On-demand training', exact: true });
        const cards = section.locator('.vf-summary--event');
        await expect(cards).toHaveCount(saved.entries.length);
        for (const [index, { fields }] of saved.entries.entries()) {
            const title = fields.title[0] + (fields.subtitle[0] ? `: ${fields.subtitle[0]}` : '');
            const link = cards.nth(index).getByRole('link', { name: title, exact: true });
            await expect(link).toHaveAttribute('href', fields.url[0]);
            await expect(link).toHaveAttribute('target', '_blank');
            await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
            await expect(cards.nth(index).locator('.vf-summary__date')).toHaveText(fields.type[0]);
            await expect(cards.nth(index).locator('.vf-summary__text')).not.toContainText('<p>');
            await expect(cards.nth(index).locator('.vf-summary__text')).not.toContainText('&nbsp;');
            expect((await cards.nth(index).locator('.vf-summary__text').textContent()).length).toBeLessThanOrEqual(201);
        }
        await expect(cards.first().locator('.vf-summary__text')).toHaveText('The BioImage Archive is a free, publicly available online resource which stores and distributes biological images. This quick tour provides information on the scope of the BioImage Archive, how to sea…');
        await expect(training.getByRole('link', { name: 'View all live training', exact: true })).toHaveAttribute('href', 'https://www.ebi.ac.uk/training/live-events?query=bioimage-archive&domain=ebiweb_training_events');
        await expect(training.getByRole('link', { name: 'View all on-demand training', exact: true })).toHaveAttribute('href', 'https://www.ebi.ac.uk/training/on-demand?query=bioimage-archive&domain=ebiweb_training_online');
    }
});

test('synthetic live cards preserve date, status, online venue and literal content without attaching description HTML', { tag: '@preservation' }, async ({ page }) => {
    const descriptionRequests: string[] = [];
    page.on('request', request => { if (request.url().startsWith('https://untrusted-training.example/')) descriptionRequests.push(request.url()); });
    await page.route(live, route => route.fulfill({ json: { entries: [
        { fields: { title: ['Live <training> & review'], subtitle: ['null'], type: ['Workshop'], status: ['Open'],
            date_time_clean: ['16 October 2026, 14:00'], venue: ['null'], url: ['https://example.org/training?name=live&format=online'],
            description: ['<p>Readable &amp; decoded</p><img src="https://untrusted-training.example/pixel" onerror="alert(1)">'] } },
        { fields: { title: ['Unsafe destination remains text'], type: 'Seminar', url: ['javascript:alert(1)'],
            description: ['Short description'], status: 'Closed', date_time_clean: '17 October 2026', venue: 'Cambridge' } },
    ] } }));
    await page.goto('/bioimage-archive/');
    const cards = page.locator('#live-tutorials .vf-summary--event');
    await expect(cards).toHaveCount(2);
    const first = cards.first();
    await expect(first.getByRole('heading')).toHaveText('Live <training> & review');
    await expect(first.locator('.vf-summary__text')).toHaveText('Readable & decoded');
    await expect(first.locator('.vf-summary__location')).toContainText('Open | 16 October 2026, 14:00 | Online');
    await expect(cards.last().locator('.vf-summary__location')).toContainText('Closed | 17 October 2026 | Cambridge');
    await expect(cards.last().getByRole('heading')).toHaveText('Unsafe destination remains text');
    await expect(cards.last().getByRole('link')).toHaveCount(0);
    await expect(page.locator('#live-tutorials img, #live-tutorials script')).toHaveCount(0);
    expect(descriptionRequests).toEqual([]);
    const link = first.getByRole('link');
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute('href', 'https://example.org/training?name=live&format=online');
});

test('empty training categories have distinct messages and retained browse destinations', async ({ page }) => {
    await page.route(ondemand, route => route.fulfill({ json: { entries: [] } }));
    await page.goto('/bioimage-archive/');
    await expect(page.locator('#live-tutorials')).toContainText('Currently there are no upcoming events');
    await expect(page.locator('#ondemand-tutorials')).toHaveText('Currently there are no on-demand tutorials. Use the link below for more information.');
    await expect(page.getByRole('link', { name: 'View all on-demand training', exact: true })).toBeVisible();
});

test('failed and malformed training responses remain unavailable rather than empty or unnamed cards', async ({ page }) => {
    await page.route(live, route => route.fulfill({ status: 503, json: {} }));
    await page.route(ondemand, route => route.fulfill({ json: { entries: [{ fields: { title: [], description: 'No title supplied' } }] } }));
    await page.goto('/bioimage-archive/');
    await expect(page.locator('#live-tutorials')).toContainText('Training events are temporarily unavailable.');
    await expect(page.locator('#ondemand-tutorials')).toHaveText('On-demand training is temporarily unavailable. Use the link below to view it.');
    await expect(page.locator('#ondemand-tutorials .vf-summary--event')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View all on-demand training', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View all live training', exact: true })).toBeVisible();
});
