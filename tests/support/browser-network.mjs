export const requestCancellationErrors = Object.freeze({
    chromium: Object.freeze(['net::ERR_ABORTED']),
    firefox: Object.freeze(['NS_BINDING_ABORTED']),
    webkit: Object.freeze(['cancelled', 'Load request cancelled']),
});

/** Navigation can cancel old assets; only search fetches and excluded media may be disregarded. */
export function expectedBrowserCancellation(request, browserName) {
    const expected = requestCancellationErrors[browserName];
    if (!expected?.includes(request.failure()?.errorText)) return false;
    return ['image', 'font'].includes(request.resourceType()) ||
        ['/bioimage-archive/images', '/bioimage-archive/studies'].includes(new URL(request.url()).pathname) &&
        request.headers()['x-requested-with'] === 'fetch';
}

/** Fulfil declared external exclusions and captured APIs; never fall through to live services. */
export async function routeBrowserRequest(route, { origin, fixtureResponse, unexpected }) {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin === 'https://alpha.bioimagearchive.org' || url.origin === 'https://www.ebi.ac.uk' && url.pathname.startsWith('/ebisearch/ws/rest/')) {
        let json;
        try { json = fixtureResponse(url.href); }
        catch (error) { unexpected.push(error instanceof Error ? error.message : String(error)); return route.abort(); }
        return route.fulfill({ json });
    }
    if (url.origin === 'https://www.googletagmanager.com') return route.fulfill({ body: '', contentType: 'text/javascript' });
    if (url.origin === 'https://livingobjects.ebi.ac.uk' && url.pathname === '/bioimaging-01-pub/bia-filelist/bff/index.html') return route.fulfill({ body: '<!doctype html><title>External file browser excluded</title>', contentType: 'text/html' });
    if (url.origin === 'https://livingobjects.ebi.ac.uk' && url.pathname === '/bioimaging-01-pub/bia-zarr-test/vizarr/index.html') return route.fulfill({ body: '<!doctype html><title>External viewer excluded</title>', contentType: 'text/html' });
    if (['image', 'font'].includes(request.resourceType())) return route.fulfill({ status: 204 });
    if (['https://assets.emblstatic.net', 'https://ebi.emblstatic.net', 'https://www.embl.org'].includes(url.origin)) return route.fulfill({ body: '', contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' });
    unexpected.push(request.url()); return route.abort();
}
