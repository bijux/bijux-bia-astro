import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { startFixture } from './server.mjs';
import { isolateBrowser } from './browser-network.mjs';

const guard = resolve(import.meta.dirname, 'server-network.mjs');

test('server/build preload maps actual API boundary and rejects undeclared HTTP and TCP egress', async () => {
  const fixture = await startFixture();
  try {
    const source = `
      import assert from 'node:assert/strict';
      import net from 'node:net';
      const data = await (await fetch('https://alpha.bioimagearchive.org/search/v1/website/study?facet.accession_id=S-BIAD90001')).json();
      assert.equal(data.hits.hits[0]._source.accession_id, 'S-BIAD90001');
      await assert.rejects(async () => fetch('https://undeclared.invalid/probe'), /Undeclared network/);
      assert.throws(() => net.connect({host:'undeclared.invalid', port:443}), /socket blocked/);
      console.log('server boundary and negative controls passed');
    `;
    const child = spawn(process.execPath, ['--import', guard, '--input-type=module', '-e', source], { env: { ...process.env, BIJUX_FIXTURE_ORIGIN: fixture.origin }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { output += value; });
    const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(status, 0, output);
    assert.equal(fixture.requests.some(request => request.path === '/search/v1/website/study'), true);
  } finally { await fixture.close(); }
});

test('real Chromium maps browser API traffic to the fixture and blocks undeclared egress', async () => {
  const fixture = await startFixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'UTC', locale: 'en-GB' });
    const blocked = await isolateBrowser(context, fixture.origin);
    const page = await context.newPage();
    await page.goto(`${fixture.origin}/probe`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    const result = await page.evaluate(async () => {
      const response = await fetch('https://alpha.bioimagearchive.org/search/v1/website/study?facet.accession_id=S-BIAD90001');
      const data = await response.json();
      let rejected = false;
      try { await fetch('https://undeclared.invalid/probe'); } catch { rejected = true; }
      return { accession: data.hits.hits[0]._source.accession_id, rejected };
    });
    assert.deepEqual(result, { accession: 'S-BIAD90001', rejected: true });
    assert.deepEqual(blocked, [{ origin: 'https://undeclared.invalid', resource: 'fetch' }]);
    assert.equal(fixture.requests.some(request => request.path === '/search/v1/website/study'), true);
    await context.close();
  } finally { await browser?.close(); await fixture.close(); }
});
