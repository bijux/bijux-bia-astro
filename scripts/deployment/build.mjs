import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildConfiguration } from './configuration.mjs';
import { sealDeployment } from './manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Invalidate prior output even if configuration validation or the new build fails.
await rm(new URL('../../artifacts/deployment/', import.meta.url), { recursive: true, force: true });
await rm(new URL('../../artifacts/dist/', import.meta.url), { recursive: true, force: true });
const configuration = buildConfiguration();
const environment = { ...process.env, ...configuration };
for (const name of ['NETLIFY', 'NETLIFY_DEV', 'AWS_LAMBDA_FUNCTION_NAME']) delete environment[name];
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, env: environment, stdio: 'inherit' });
const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status, signal) => signal ? reject(new Error(`Deployment build stopped by ${signal}.`)) : resolve(status));
});
if (code !== 0) process.exit(code ?? 1);
const manifest = await sealDeployment(root, configuration);
console.log(`Verified deployment: ${Object.keys(manifest.files).length} files.`);
