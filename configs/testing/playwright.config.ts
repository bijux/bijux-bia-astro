import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../../', import.meta.url));
const port = process.env.WEBSITE_TEST_PORT ?? '4399';
export default defineConfig({
    testDir: '../../tests/e2e',
    globalSetup: fileURLToPath(new URL('../../tests/support/website/delivery.mjs', import.meta.url)),
    outputDir: '../../artifacts/browser-results',
    reporter: [['list'], ['json', { outputFile: `${repository}/artifacts/browser-results/results.json` }]],
    workers: 2,
    retries: 0,
    use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] } },
        { name: 'firefox', grep: /@preservation/, use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } } },
        { name: 'webkit', grep: /@preservation/, use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } } },
    ],
    webServer: { command: 'node tests/support/website/server.mjs', cwd: repository, url: `http://127.0.0.1:${port}/health/ready`, reuseExistingServer: false, timeout: 120000 },
});
