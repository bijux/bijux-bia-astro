import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startFixture } from '../../tests/fixtures/server.mjs';
import { fixtureVersion } from '../../tests/fixtures/catalog.mjs';
import { probeRuntime } from './fixture-runtime.mjs';

const root = resolve(import.meta.dirname, '../..');
const adapter = process.argv[2];
if (process.argv.length !== 3 || !['node', 'netlify'].includes(adapter)) {
  console.error('Usage: npm run fixture-build -- node|netlify');
  process.exit(2);
}
const output = resolve(root, `artifacts/fixture-build/${adapter}`);
mkdirSync(output, { recursive: true });
const fixture = await startFixture({ log: resolve(output, 'requests.jsonl') });
const environment = { ...process.env };
for (const key of ['NETLIFY', 'NETLIFY_DEV', 'AWS_LAMBDA_FUNCTION_NAME']) delete environment[key];
environment.PUBLIC_SEARCH_API = `${fixture.origin}/search/v1`;
environment.PUBLIC_MONGO_API = `${fixture.origin}/api/v2`;
environment.PUBLIC_GTAG = '';
environment.ASTRO_TELEMETRY_DISABLED = '1';
environment.BIJUX_FIXTURE_ORIGIN = fixture.origin;
environment.BIJUX_EGRESS_LOG = resolve(output, 'blocked-network.jsonl');
environment.NODE_OPTIONS = `--import=${pathToFileURL(resolve(root, 'tests/fixtures/server-network.mjs')).href}`;
if (adapter === 'netlify') environment.NETLIFY = 'true';
const command = adapter === 'node' ? ['run', 'build'] : ['run', 'astro', '--', 'build'];
const started = new Date().toISOString();
const clock = performance.now();
let child;
const stop = signal => { child?.kill(signal); };
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('SIGINT', () => stop('SIGINT'));
try {
  child = spawn('npm', command, { cwd: root, env: environment, stdio: 'inherit' });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  writeFileSync(resolve(output, 'result.json'), `${JSON.stringify({ adapter, command: ['npm', ...command], fixture_version: fixtureVersion, started_at_utc: started, duration_seconds: (performance.now() - clock) / 1000, ...status, public_search_api: environment.PUBLIC_SEARCH_API, public_mongo_api: environment.PUBLIC_MONGO_API, netlify: environment.NETLIFY || null, requests: fixture.requests.length }, null, 2)}\n`);
  if (status.code === 0 && !status.signal && adapter === 'node') await probeRuntime(root, environment, output, fixture);
  process.exitCode = status.code === 0 && !status.signal ? 0 : 1;
} finally { await fixture.close(); }
