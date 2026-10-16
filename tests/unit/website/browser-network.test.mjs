import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedBrowserCancellation, routeBrowserRequest } from '../../support/browser-network.mjs';

function request({ url = 'http://local/bioimage-archive/images', type = 'fetch', error = 'NS_BINDING_ABORTED', headers = { 'x-requested-with': 'fetch' } } = {}) {
    return { url: () => url, resourceType: () => type, failure: () => ({ errorText: error }), headers: () => headers };
}

test('cancellation exemptions retain genuine script, connection and unrelated request failures', () => {
    assert.equal(expectedBrowserCancellation(request(), 'firefox'), true);
    for (const error of ['cancelled', 'Load request cancelled'])
        assert.equal(expectedBrowserCancellation(request({ error }), 'webkit'), true);
    assert.equal(expectedBrowserCancellation(request({ type: 'image', url: 'http://local/logo.png' }), 'firefox'), true);
    for (const fields of [{ error: 'NS_ERROR_CONNECTION_REFUSED' }, { url: 'http://local/app.js', type: 'script' }, { headers: {} }, { url: 'http://local/other' }])
        assert.equal(expectedBrowserCancellation(request(fields), 'firefox'), false);
    assert.equal(expectedBrowserCancellation(request(), 'webkit'), false);
});

async function route(url, type = 'script', fixtureResponse = () => ({ captured: true })) {
    const actions = [], unexpected = [];
    await routeBrowserRequest({ request: () => request({ url, type }),
        continue: () => actions.push(['continue']), abort: () => actions.push(['abort']), fulfill: value => actions.push(['fulfill', value]),
    }, { origin: 'http://local', fixtureResponse, unexpected });
    return { actions, unexpected };
}

test('only the exact local origin passes through and unknown scripts cannot access live services', async () => {
    assert.deepEqual((await route('http://local/app.js')).actions, [['continue']]);
    for (const url of ['http://local.evil/app.js', 'https://unknown.example/app.js', 'http://assets.emblstatic.net/app.js']) {
        assert.deepEqual(await route(url), { actions: [['abort']], unexpected: [url] });
    }
    assert.deepEqual((await route('https://unknown.example/image.png', 'image')).actions, [['fulfill', { status: 204 }]]);
});

test('captured API responses and declared chrome are fulfilled while unrecorded API calls fail', async () => {
    assert.deepEqual(await route('https://alpha.bioimagearchive.org/search/v1/website/image'), { actions: [['fulfill', { json: { captured: true } }]], unexpected: [] });
    assert.deepEqual(await route('https://alpha.bioimagearchive.org/unrecorded', 'fetch', () => { throw new Error('Unrecorded API'); }), { actions: [['abort']], unexpected: ['Unrecorded API'] });
    const chrome = await route('https://assets.emblstatic.net/script.js');
    assert.deepEqual(chrome, { actions: [['fulfill', { body: '', contentType: 'text/javascript' }]], unexpected: [] });
});

test('transport failures remain errors rather than being relabelled as unrecorded API fixtures', async () => {
    const failure = new Error('Response transport failed'), unexpected = [];
    await assert.rejects(routeBrowserRequest({ request: () => request({ url: 'https://alpha.bioimagearchive.org/search/v1/website/image' }),
        fulfill: async () => { throw failure; },
    }, { origin: 'http://local', fixtureResponse: () => ({}), unexpected }), error => error === failure);
    assert.deepEqual(unexpected, []);
});
