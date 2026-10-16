import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import prepareWebsite, { env, buildRoot } from './application.mjs';
import { prepareRuntime, runtimeRoot } from './runtime.mjs';

await prepareWebsite();
await prepareRuntime(buildRoot);
const childEnv = { ...env, NODE_ENV: 'production', NODE_OPTIONS: '',
    HOST: '127.0.0.1', PORT: process.env.WEBSITE_TEST_PORT ?? '4399',
    DEPLOYMENT_MANIFEST: `${runtimeRoot}/artifacts/deployment/manifest.json` };
delete childEnv.NODE_PATH;
const child = spawn(process.execPath, [
    '--import', fileURLToPath(new URL('./runtime-boundary.mjs', import.meta.url)),
    '--import', new URL('../../fixtures/website/preload.mjs', import.meta.url).href,
    'src/server/host.mjs',
], { cwd: runtimeRoot, env: childEnv, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
const [code, signal] = await once(child, 'exit');
process.exitCode = code ?? (signal ? 1 : 0);
