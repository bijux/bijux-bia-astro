import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { searchRequest, fetchJSON, boundedMap, browseResponse } from "../../src/security/requests.mjs";

test("search limits reject ambiguous or nonintegral controls while preserving repeated scientific facets", () => {
    for (const query of ["pagination.page_size=&pagination.page_size=100000", "pagination.page=0", "pagination.page=-1", "pagination.page=1.1", "pagination.page=Infinity", "pagination.page_size=101", "query=a&query=b", "cursor=a&cursor=b", `query=${"x".repeat(2049)}`]) {
        assert.throws(() => searchRequest(new URL(`http://localhost/images?${query}`)), RangeError, query);
    }
    const request = searchRequest(new URL("http://localhost/images?size_t=1&size_t=1e-9-2e-9&pagination.page_size=25&query=µ"));
    assert.deepEqual(request, { page: 1, pageSize: 25, query: "µ", cursor: null });
});

test("real HTTP responses cannot redirect to another origin, exceed budgets or masquerade as valid JSON", async () => {
    let destinationCalls = 0;
    const destination = createServer((request, response) => { destinationCalls++; response.end('{}'); });
    const source = createServer((request, response) => {
        if (request.url === '/redirect') { response.writeHead(302, { Location: `http://127.0.0.1:${destination.address().port}/` }); response.end(); }
        else if (request.url === '/same-origin') { response.writeHead(302, { Location: '/valid' }); response.end(); }
        else if (request.url === '/large') { response.writeHead(200); response.write(' '.repeat(65)); response.end('{}'); }
        else if (request.url === '/slow') { response.writeHead(200); response.write('{'); }
        else if (request.url === '/invalid') response.end('<html>Unavailable</html>');
        else if (request.url === '/invalid-utf8') response.end(Buffer.from([0xc3, 0x28]));
        else if (request.url === '/error') { response.writeHead(503); response.end('upstream private detail'); }
        else response.end('{"value":"µ | < >"}');
    });
    try {
        source.listen(0,'127.0.0.1'); destination.listen(0,'127.0.0.1');
        await Promise.all([once(source,'listening'),once(destination,'listening')]);
        const url = `http://127.0.0.1:${source.address().port}`;
        assert.deepEqual(await fetchJSON(url+'/same-origin'), { value: 'µ | < >' });
        await assert.rejects(fetchJSON(url+'/redirect'), /configured origin/);
        assert.equal(destinationCalls, 0);
        await assert.rejects(fetchJSON(url+'/large', { maxBytes: 64 }), /size limit/);
        await assert.rejects(fetchJSON(url+'/invalid'), SyntaxError);
        await assert.rejects(fetchJSON(url+'/invalid-utf8'), TypeError);
        await assert.rejects(fetchJSON(url+'/error'), error => error.message === 'API returned HTTP 503.');
        const started = Date.now();
        await assert.rejects(fetchJSON(url+'/slow', { timeout: 100 }));
        assert(Date.now() - started < 2000);
    } finally {
        source.closeAllConnections(); destination.closeAllConnections();
        await Promise.all([new Promise(resolve => source.close(resolve)), new Promise(resolve => destination.close(resolve))]);
    }
});

test("bounded mapping preserves associations and caps simultaneous work", async () => {
    let active=0, peak=0;
    const result = await boundedMap(Array.from({length:17}, (_,index)=>index), async value => {
        peak=Math.max(peak,++active);
        await new Promise(resolve=>setTimeout(resolve, 5*(3-value%3)));
        active--; return value*2;
    }, 3);
    assert.equal(peak, 3);
    assert.deepEqual(result, Array.from({length:17}, (_,index)=>index*2));
    await assert.rejects(boundedMap([1],()=>1,0), RangeError);
});

test("one failed operation stops bounded mapping from scheduling the remaining catalogue", async () => {
    const started = [];
    await assert.rejects(boundedMap(Array.from({ length: 100 }, (_, index) => index), async value => {
        started.push(value);
        if (value === 0) throw new Error("Controlled API failure");
        await new Promise(resolve => setTimeout(resolve, 10));
    }, 4), /Controlled API failure/);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert(started.length <= 4, JSON.stringify(started));
});

test("malformed successful browse responses cannot trigger unsafe pagination arithmetic or false empty results", () => {
    const response = { hits:{hits:[],total:{value:0}},facets:{},pagination:{page:1,page_size:12,total_pages:0,next_cursor:null} };
    assert.equal(browseResponse(response),response);
    for (const value of [{}, {...response,facets:null}, {...response,pagination:{...response.pagination,page_size:0}}, {...response,pagination:{...response.pagination,total_pages:'1e999'}}, {...response,hits:{hits:[{}],total:{value:1}}}]) assert.throws(()=>browseResponse(value),TypeError);
});
