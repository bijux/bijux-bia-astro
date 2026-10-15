import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', 'configs/testing/playwright.config.ts'], {
    stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: 'artifacts/browsers' },
});
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
