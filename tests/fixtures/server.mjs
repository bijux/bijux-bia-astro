import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureVersion, primaryAccessions, knownAccessions, imageUUID, syntheticStudy, syntheticImage, searchResponse } from './catalog.mjs';

export async function startFixture({ port = 0, log } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port.');
  if (log) mkdirSync(dirname(log), { recursive: true });
  const requests = [];
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method) || request.url.length > 2048) {
      response.writeHead(400).end('{"error":"unsupported fixture request"}');
      return;
    }
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(request.url, origin);
    const observed = { method: request.method, path: url.pathname, query: url.search, fixture_version: fixtureVersion };
    requests.push(observed);
    if (log) appendFileSync(log, `${JSON.stringify(observed)}\n`);
    const send = (value, code = 200) => {
      const body = JSON.stringify(value);
      if (body.length > 1024 * 1024) throw new Error('Fixture payload exceeded limit.');
      response.writeHead(code).end(body);
    };
    const scenario = url.searchParams.get('fixture_case');
    if (scenario === 'delay') await new Promise(resolve => setTimeout(resolve, 80));
    if (scenario === 'error') return send({ error: 'synthetic service failure' }, 503);
    if (scenario === 'malformed') return response.end('{malformed synthetic JSON');
    if (url.pathname === '/health') return send({ fixture_version: fixtureVersion });
    if (url.pathname === '/fixture-thumbnail.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#173c4e"/></svg>');
      return;
    }
    if (url.pathname === '/probe') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Synthetic fixture boundary probe</title><p>Fixture network probe</p>');
      return;
    }
    const search = url.pathname.match(/^\/search\/v1\/website\/(browse\/)?(study|image)$/);
    if (search) {
      const accession = url.searchParams.get('facet.accession_id') || url.searchParams.get('facet.accession_id.eq');
      const query = url.searchParams.get('query');
      let ids = accession ? (knownAccessions.has(accession) ? [accession] : []) : primaryAccessions;
      if (query && !search[1]) ids = [...knownAccessions].filter(id => id === query || imageUUID(id) === query || `synthetic-dataset-${id}` === query || `synthetic-study-${id}` === query);
      if (url.searchParams.has('facet.downstream_of')) ids = [];
      if (query === '__empty__' || scenario === 'empty') ids = [];
      const page = Math.min(100, Math.max(1, Number(url.searchParams.get('pagination.page')) || 1));
      const size = Math.min(1000, Math.max(1, Number(url.searchParams.get('pagination.page_size')) || 100));
      const records = ids.map(id => search[2] === 'study' ? syntheticStudy(id, origin) : syntheticImage(id, origin));
      if (scenario === 'missing-optional') for (const record of records) {
        delete record.author; delete record.example_image_uri; delete record.keyword; delete record.additional_metadata;
      }
      return send(searchResponse(records, page, size));
    }
    if (/^\/api\/v2\/dataset\/[^/]+\/file_reference$/.test(url.pathname)) return send([]);
    if (/^\/biostudies\/api\/v1\/studies\/[^/]+\/info$/.test(url.pathname)) return send({ httpLink: `${origin}/synthetic-files/`, globusLink: '' });
    if (url.pathname === '/ebisearch/ws/rest/ebiweb_training_online' || url.pathname === '/ebisearch/ws/rest/ebiweb_training_events') return send({ entries: [] });
    return send({ error: 'undeclared fixture route' }, 404);
  });
  server.requestTimeout = 2000;
  server.headersTimeout = 2000;
  server.keepAliveTimeout = 100;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startFixture({ port: Number(process.env.BIJUX_FIXTURE_PORT || 0), log: process.env.BIJUX_FIXTURE_LOG });
  console.log(JSON.stringify({ origin: fixture.origin, fixture_version: fixtureVersion }));
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
