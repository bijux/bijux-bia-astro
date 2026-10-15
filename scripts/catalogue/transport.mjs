import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);

export async function regularFile(file) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new Error(`Snapshot input must be a bounded regular file: ${file}`);
    const bytes = await readFile(file);
    if (bytes.length > 12 * 1024 * 1024) throw new Error('Snapshot input exceeded its size limit.');
    return bytes;
}

/** A build-scoped transport: only public GETs, bounded requests, and no network fallback on replay. */
export function snapshotTransport({ directory, index, concurrency = 4, fetch: upstream = globalThis.fetch, timeout = 15000, maxBytes = 8 * 1024 * 1024 }) {
    if (index !== undefined && (!index || typeof index.responses !== 'object' || !index.responses)) throw new Error('Invalid replay snapshot index.');
    if (![timeout, maxBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError('Snapshot transport limits must be positive integers.');
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new RangeError('Snapshot concurrency must be between 1 and 8.');
    const pending = new Map();
    let active = 0;
    const waiting = [];
    const statistics = { calls: 0, deduplicated: 0, network: 0, peakRequests: 0, activeRequests: 0 };
    const errors = [];
    async function capture(request, key) {
        if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
        else active++;
        statistics.activeRequests++;
        statistics.peakRequests = Math.max(statistics.peakRequests, active);
        statistics.network++;
        try {
            const response = await upstream(request, { signal: AbortSignal.timeout(timeout), redirect: 'manual' });
            const reader = response.body?.getReader();
            const chunks = []; let bytes = 0;
            try {
                while (reader) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    bytes += value.length;
                    if (bytes > maxBytes) throw new RangeError('Snapshot response exceeded its size limit.');
                    chunks.push(value);
                }
            } catch (error) { await reader?.cancel().catch(() => {}); throw error; }
            const body = Buffer.concat(chunks, bytes).toString('base64');
            const record = { request: key, status: response.status, headers: [...response.headers].filter(([name]) => !['set-cookie', 'set-cookie2'].includes(name)), body };
            await writeFile(join(directory, `${digest(key)}.json`), canonical(record), { flag: 'wx' });
            return record;
        } finally {
            statistics.activeRequests--;
            const next = waiting.shift();
            if (next) next(); else active--;
        }
    }
    async function replay(key) {
        const id = digest(key);
        const expected = index.responses[id];
        if (!expected) throw new Error(`Snapshot has no response for ${key}.`);
        const bytes = await regularFile(join(directory, `${id}.json`));
        if (digest(bytes) !== expected) throw new Error(`Snapshot response hash mismatch: ${id}.`);
        const record = JSON.parse(bytes);
        if (record.request !== key) throw new Error('Snapshot response belongs to a different request.');
        return record;
    }
    function response(record) {
        return new Response([204, 205, 304].includes(record.status) ? null : Buffer.from(record.body, 'base64'), { status: record.status, headers: record.headers });
    }
    return {
        statistics, errors,
        async fetch(input, init) {
            let request;
            try { request = new Request(input, init); }
            catch (error) { errors.push({ message: 'Invalid build request.' }); throw error; }
            const url = new URL(request.url);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || request.method !== 'GET' || request.redirect !== 'manual' || [...request.headers.keys()].some(name => !['accept', 'accept-language'].includes(name))) {
                errors.push({ message: 'Unsupported build request.' });
                throw new Error('Snapshots require unauthenticated, bounded GET requests with manual redirects. Use the application API transport.');
            }
            request.signal.throwIfAborted();
            url.hash = '';
            const key = canonical({ url: url.href, headers: [...request.headers].sort() });
            statistics.calls++;
            if (pending.has(key)) statistics.deduplicated++;
            else pending.set(key, (index ? replay(key) : capture(request, key)).catch(error => {
                errors.push({ request: key, message: 'Request or snapshot input failed.' });
                throw error;
            }));
            // One caller's cancellation must not abort another caller's shared upstream request.
            const result = pending.get(key);
            let abort;
            try {
                return response(await Promise.race([result, new Promise((_, reject) => {
                    abort = () => reject(request.signal.reason);
                    request.signal.addEventListener('abort', abort, { once: true });
                })]));
            } finally { request.signal.removeEventListener('abort', abort); }
        },
    };
}
