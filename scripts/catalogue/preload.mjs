import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, snapshotTransport } from './transport.mjs';

const directory = process.env.CATALOGUE_BUILD_DIRECTORY;
if (!directory) throw new Error('Snapshot transport requires a build directory.');
const bytes = process.env.CATALOGUE_SNAPSHOT ? readFileSync(join(directory, 'index.json')) : undefined;
if (bytes && digest(bytes) !== process.env.CATALOGUE_SNAPSHOT_HASH) throw new Error('Snapshot index changed after validation.');
const index = bytes ? JSON.parse(bytes) : undefined;
const transport = snapshotTransport({ directory, index, concurrency: Number(process.env.CATALOGUE_REQUEST_CONCURRENCY ?? 4) });
globalThis.fetch = transport.fetch;
process.once('exit', () => {
    writeFileSync(process.env.CATALOGUE_STATISTICS_FILE + `.${process.pid}`, JSON.stringify({ ...transport.statistics, errors: transport.errors, maxRssKb: process.resourceUsage().maxRSS }));
});
