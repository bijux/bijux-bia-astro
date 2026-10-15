import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchNavigation } from '../../../src/features/search/client/navigation.mjs';
import { historyRequestURL } from '../../../src/features/search/pagination/history.mjs';

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

test('superseded successes and failures cannot commit or redirect even when a transport ignores abort', async () => {
    for (const outcome of ['resolve', 'reject']) {
        const first = deferred(), second = deferred(), signals = [], commits = [], failures = [], busy = [];
        const navigation = createSearchNavigation({
            load: (url, signal) => { signals.push(signal); return url === 'first' ? first.promise : second.promise; },
            commit: value => commits.push(value), fail: value => failures.push(value), busy: value => busy.push(value),
        });
        const pending = navigation.navigate('first');
        const latest = navigation.navigate('second');
        assert.equal(signals[0].aborted, true);
        second.resolve('latest'); await latest;
        first[outcome](new Error('Stale result')); await pending;
        assert.deepEqual(commits, ['latest']); assert.deepEqual(failures, []);
        assert.deepEqual(busy, [true, true, false]);
    }
});

test('current failures fall back once while disposal aborts active work and prevents future navigation', async () => {
    const current = deferred(), failures = [], commits = [], signals = [];
    const navigation = createSearchNavigation({ load: (_url, signal) => { signals.push(signal); return current.promise; }, commit: value => commits.push(value), fail: value => failures.push(value), busy() {} });
    const pending = navigation.navigate('current');
    current.reject(new Error('Unavailable')); await pending;
    assert.deepEqual(failures, ['current']);
    const late = deferred();
    const disposed = createSearchNavigation({ load: (_url, signal) => { signals.push(signal); return late.promise; }, commit: value => commits.push(value), fail: value => failures.push(value), busy() {} });
    const work = disposed.navigate('late'); disposed.dispose(); disposed.dispose();
    assert.equal(signals.at(-1).aborted, true);
    late.resolve('late'); await work; await disposed.navigate('another');
    assert.equal(signals.length, 2); assert.deepEqual(commits, []); assert.deepEqual(failures, ['current']);
});

test('history restores transport URLs only when origin, credentials and visible filters match', () => {
    const current = 'https://example.org/bioimage-archive/images?size_t=1';
    const saved = current + '&cursor=opaque&pagination.page=834';
    assert.equal(historyRequestURL(current, { fetchURL: saved }).href, saved);
    for (const fetchURL of ['https://other.example/images?size_t=1', saved.replace('size_t=1', 'size_t=2'), saved.replace('example.org', 'user:secret@example.org'), 'invalid', saved.replace('cursor=opaque', `cursor=${'x'.repeat(8193)}`)]) {
        assert.equal(historyRequestURL(current, { fetchURL }).href, current);
    }
    const allowed = new URL(current); allowed.searchParams.set('cursor', 'μ'.repeat(8192));
    assert.equal(historyRequestURL(current, { fetchURL: allowed.href }).href, allowed.href);
});
