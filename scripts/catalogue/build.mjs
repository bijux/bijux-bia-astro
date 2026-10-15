import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, regularFile } from './transport.mjs';
import { sealSnapshot, verifySnapshot } from './snapshot.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = join(root, 'artifacts/catalogue/builds', randomUUID());
await mkdir(run, { recursive: true });
const input = process.env.CATALOGUE_SNAPSHOT;
const directory = input ? resolve(root, input) : join(root, 'artifacts/catalogue/snapshots', randomUUID());
if (process.argv.length > 2) throw new Error('Use CATALOGUE_SNAPSHOT=<directory> npm run build to replay a snapshot.');
const renderConcurrency = Number(process.env.CATALOGUE_RENDER_CONCURRENCY ?? 4);
if (!Number.isSafeInteger(renderConcurrency) || renderConcurrency < 1 || renderConcurrency > 8) throw new RangeError('Render concurrency must be between 1 and 8.');
const required = await lstat(join(root, 'src/pages/study/[accessionID].astro')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
// Invalidate deployment provenance before any failed validation or rebuild can leave it current.
await rm(join(root, 'artifacts/deployment'), { recursive: true, force: true });
if (input) await verifySnapshot(directory, { required });
else await mkdir(directory, { recursive: true });
const inputHash = input ? digest(await regularFile(join(directory, 'index.json'))) : undefined;
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CATALOGUE_RENDER_CONCURRENCY: String(renderConcurrency), NODE_COMPILE_CACHE: join(root, 'artifacts/node-compile-cache') };
async function execute(command, env) {
    const child = spawn(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), command], { cwd: root, env, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(new Error(`Build stopped by ${signal}.`)) : resolve(code)); });
    if (code !== 0) throw new Error(`Astro ${command} failed (${code}).`);
}
const started = performance.now();
await execute('check', environment);
await rm(join(root, 'artifacts/dist'), { recursive: true, force: true });
const options = `${environment.NODE_OPTIONS ?? ''} --import=${new URL('./preload.mjs', import.meta.url).href}`.trim();
await execute('build', { ...environment, NODE_OPTIONS: options, CATALOGUE_BUILD_DIRECTORY: directory, CATALOGUE_STATISTICS_FILE: join(run, 'requests.json'), ...(input ? { CATALOGUE_SNAPSHOT_HASH: inputHash } : {}) });
await copyFile(join(root, 'public/robots.txt'), join(root, 'artifacts/dist/robots.txt'));
await copyFile(join(root, 'public/redirect_index.html'), join(root, 'artifacts/dist/index.html'));
const writers = await Promise.all((await readdir(run)).filter(name => name.startsWith('requests.json.')).map(async name => JSON.parse(await regularFile(join(run, name)))));
if (!writers.length) throw new Error('Build transport did not report its request coverage.');
if (!input && writers.filter(writer => writer.calls > 0).length !== 1 && writers.some(writer => writer.calls > 0)) throw new Error('Snapshot capture requires the default single-process prerenderer; concurrent page rendering is supported.');
const statistics = writers.reduce((total, writer) => ({ calls: total.calls + writer.calls, deduplicated: total.deduplicated + writer.deduplicated, network: total.network + writer.network, activeRequests: total.activeRequests + writer.activeRequests, peakRequests: Math.max(total.peakRequests, writer.peakRequests), maxRssKb: Math.max(total.maxRssKb, writer.maxRssKb ?? 0), errors: [...total.errors, ...writer.errors] }), { calls: 0, deduplicated: 0, network: 0, activeRequests: 0, peakRequests: 0, maxRssKb: 0, errors: [] });
if (inputHash && digest(await regularFile(join(directory, 'index.json'))) !== inputHash) throw new Error('Snapshot index changed during the build.');
if (statistics.errors.length || statistics.activeRequests) throw new Error(`Build inputs were incomplete; no verified snapshot or deployment was published. Request diagnostics: ${run}`);
const index = input ? await verifySnapshot(directory, { root, required }) : await sealSnapshot(directory, { root, required, source: { packageLock: digest(await regularFile(join(root, 'package-lock.json'))) } });
const snapshotHash = digest(await regularFile(join(directory, 'index.json')));
const report = { mode: input ? 'replay' : 'capture', snapshot: directory, snapshotHash, studies: index.catalogue.count, durationMs: Math.round(performance.now() - started), ...statistics };
await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await mkdir(join(root, 'artifacts/deployment'), { recursive: true });
await writeFile(join(root, 'artifacts/deployment/catalogue.json'), JSON.stringify({ snapshotHash, studies: report.studies, responses: Object.keys(index.responses).length }) + '\n');
console.log(`Catalogue ${report.mode}: ${index.catalogue.count} studies, ${statistics.network} network requests, ${statistics.deduplicated} reused responses. Snapshot: ${directory}`);
console.log(`Build evidence: ${join(run, 'report.json')}`);
