import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestJSON } from '../../../src/api/http.mjs';

test('request sessions bound concurrency, share duplicates and stay independent between pages', async () => {
    let active = 0, peak = 0, calls = 0;
    const releases = [];
    let twoStarted;
    const started = new Promise(resolve => { twoStarted = resolve; });
    const request = async url => {
        calls++; active++; peak = Math.max(active, peak);
        if (calls <= 2) {
            const held = new Promise(resolve => releases.push(resolve));
            if (calls === 2) twoStarted();
            await held;
        }
        active--; return { url, calls };
    };
    const session = createRequestJSON({ request, concurrency: 2 });
    const first = session('https://example.org/one');
    const duplicate = session('https://example.org/one');
    const second = session('https://example.org/two');
    const third = session('https://example.org/three');
    await started;
    assert.equal(calls, 2);
    releases.forEach(release => release());
    const result = await Promise.all([first, duplicate, second, third]);
    assert.equal(result[0], result[1]);
    assert.equal(peak, 2); assert.equal(calls, 3);
    await createRequestJSON({ request })('https://example.org/one');
    assert.equal(calls, 4);
});

test('bounded session caches do not hide failures and cancellation prevents queued network work', async () => {
    for (const options of [{ concurrency: 0 }, { concurrency: NaN }, { maxCached: Infinity }]) assert.throws(() => createRequestJSON(options), RangeError);
    const failure = new Error('Unavailable');
    let calls = 0;
    const session = createRequestJSON({ maxCached: 1, request: async () => { calls++; throw failure; } });
    for (const value of ['one', 'one', 'two', 'two']) await assert.rejects(session(`https://example.org/${value}`), error => error === failure);
    assert.equal(calls, 3);
    const controller = new AbortController();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let started;
    const began = new Promise(resolve => { started = resolve; });
    calls = 0;
    const cancelled = createRequestJSON({ concurrency: 1, signal: controller.signal, request: async (_url, { signal }) => {
        calls++; started(); await held; signal.throwIfAborted();
    } });
    const results = Promise.allSettled([cancelled('https://example.org/one'), cancelled('https://example.org/two')]);
    await began; controller.abort(failure); release();
    assert((await results).every(result => result.status === 'rejected' && result.reason === failure));
    assert.equal(calls, 1);
});
