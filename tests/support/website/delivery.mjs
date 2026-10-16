import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomically } from '../../../scripts/filesystem/atomic-file.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const clientPrefix = 'artifacts/dist/bioimage-archive/client/';

/** Compare every generated document with its sealed bytes through the production server. */
export async function verifyDelivery({ application, reportPath, baseURL }) {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const delivery = report.delivery = { status: 'IN_PROGRESS', requested: [], verified: [] };
    await writeFileAtomically(reportPath, JSON.stringify(report, null, 2) + '\n');
    try {
        const bytes = await readFile(path.join(application, 'artifacts/deployment/manifest.json'));
        delivery.manifestHash = digest(bytes);
        const manifest = JSON.parse(bytes);
        const entries = Object.entries(manifest.files ?? {}).filter(([file]) => file.startsWith(clientPrefix) && file.endsWith('.html'));
        const routes = entries.map(([file]) => file.slice(clientPrefix.length)).sort();
        assert(routes.length, 'Deployment manifest contains no generated HTML.');
        assert(Array.isArray(report.generatedRoutes), 'Build report is missing generated route coverage.');
        assert.deepEqual([...report.generatedRoutes].sort(), routes, 'Build report and deployment HTML coverage differ.');
        assert.equal(report.generatedHtml, routes.length, 'Generated HTML count differs from manifest coverage.');
        delivery.requested = routes;
        for (const [file, expected] of entries.sort(([a], [b]) => a.localeCompare(b))) {
            const relative = file.slice(clientPrefix.length);
            assert(!relative.includes('\\') && relative.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid generated route: ${relative}`);
            assert(/^[a-f0-9]{64}$/.test(String(expected)), `Missing artifact hash: ${relative}`);
            const route = relative === 'index.html' ? '' : relative.endsWith('/index.html') ? relative.slice(0, -10) : relative;
            const url = new URL(`/bioimage-archive/${route.split('/').map(encodeURIComponent).join('/')}`, baseURL);
            const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
            try {
                assert.equal(response.status, 200, `Generated route failed: ${relative}`);
                assert.match(response.headers.get('content-type') ?? '', /^text\/html(?:;|$)/i, `Wrong document type: ${relative}`);
                assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `Missing response protection: ${relative}`);
                assert.equal(digest(Buffer.from(await response.arrayBuffer())), expected, `Served HTML differs from sealed artifact: ${relative}`);
            } finally {
                await response.body?.cancel().catch(() => {});
            }
            delivery.verified.push(relative);
        }
        delivery.status = 'COMPLETED';
        return delivery;
    } catch (error) {
        delivery.status = 'FAILED';
        delivery.error = error.message;
        throw error;
    } finally {
        await writeFileAtomically(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
}

// Playwright starts the configured production server before this global setup.
export default async function verifyProductionServer(config) {
    const { runtimeRoot } = await import('./runtime.mjs');
    const { buildRoot } = await import('./application.mjs');
    await verifyDelivery({ application: runtimeRoot, reportPath: path.join(path.dirname(buildRoot), 'report.json'),
        baseURL: config.projects[0].use.baseURL });
}
