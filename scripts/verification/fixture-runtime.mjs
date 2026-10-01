import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { imageUUID, primaryAccessions } from '../../tests/fixtures/catalog.mjs';

export async function probeRuntime(root, environment, output, fixture) {
  const source = `
    const { startServer } = await import('./dist/bioimage-archive/server/entry.mjs');
    const runtime = startServer();
    runtime.server.server.once('listening', () => process.send({ port: runtime.server.server.address().port }));
    process.once('message', async () => { await runtime.server.stop(); process.disconnect(); });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root, env: { ...environment, ASTRO_NODE_AUTOSTART: 'disabled', HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let logs = '';
  child.stdout.on('data', value => { logs += value; });
  child.stderr.on('data', value => { logs += value; });
  const exited = once(child, 'exit');
  const started = performance.now();
  const observations = [];
  try {
    const [{ port }] = await once(child, 'message', { signal: AbortSignal.timeout(8000) });
    const origin = `http://127.0.0.1:${port}`;
    const id = primaryAccessions[0];
    const uuid = imageUUID(id);
    for (const path of [`/bioimage-archive/study/${id}`, `/bioimage-archive/image/${uuid}`]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5000) });
      const html = await response.text();
      assert.equal(response.status, 200, `${path}: ${logs}`);
      assert.ok(html.includes(`Synthetic fixture study ${id}`));
      observations.push({ path, status: response.status, synthetic_title: true });
    }
    assert.ok(fixture.requests.some(request => request.path.endsWith('/image') && new URLSearchParams(request.query).get('query') === uuid), 'Built runtime did not query the actual fixture API.');
    child.send('stop');
    const [code, signalName] = await exited;
    assert.equal(code, 0, logs);
    assert.equal(signalName, null);
    writeFileSync(resolve(output, 'runtime-result.json'), `${JSON.stringify({ observations, duration_seconds: (performance.now() - started) / 1000, exit_code: code, fixture_requests: fixture.requests.length }, null, 2)}\n`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    writeFileSync(resolve(output, 'runtime.log'), logs);
  }
}
