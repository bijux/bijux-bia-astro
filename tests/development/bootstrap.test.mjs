import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = resolve(root, 'artifacts/development-tests');
mkdirSync(scratch, { recursive: true });

function fixture({ node = process.versions.node, npm = '11.19.0', installedNpm = npm, exit = 0 } = {}) {
  const directory = mkdtempSync(join(scratch, 'bootstrap-'));
  for (const path of ['scripts/development', 'configs/development', 'bin']) {
    mkdirSync(join(directory, path), { recursive: true });
  }
  copyFileSync(join(root, 'scripts/development/bootstrap.mjs'), join(directory, 'scripts/development/bootstrap.mjs'));
  writeFileSync(join(directory, 'configs/development/toolchain.json'), JSON.stringify({ node, npm }));
  writeFileSync(join(directory, 'bin/npm'), `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo '${installedNpm}'
  exit 0
fi
printf '%s\\n' "$*" "$npm_config_cache" > invoked.txt
exit ${exit}
`, { mode: 0o755 });
  const run = command => spawnSync(process.execPath, [join(directory, 'scripts/development/bootstrap.mjs'), command], {
    cwd: scratch, encoding: 'utf8', env: { ...process.env, PATH: join(directory, 'bin') },
  });
  return { directory, run };
}

test('doctor inspects without installing or writing repository files', () => {
  const { directory, run } = fixture();
  const before = readdirSync(directory, { recursive: true });
  assert.equal(run('doctor').status, 0);
  assert.deepEqual(readdirSync(directory, { recursive: true }), before);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});

test('a Node mismatch blocks installation', () => {
  const { directory, run } = fixture({ node: '0.0.1' });
  const result = run('install');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /toolchain mismatch/);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});

test('an npm mismatch blocks installation', () => {
  const { directory, run } = fixture({ installedNpm: '0.0.1' });
  assert.equal(run('install').status, 1);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});

test('missing npm is diagnosed without installing', () => {
  const { directory, run } = fixture();
  const result = spawnSync(process.execPath, [join(directory, 'scripts/development/bootstrap.mjs'), 'install'], {
    encoding: 'utf8', env: { ...process.env, PATH: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot inspect npm/);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});

test('installation delegates locked setup and preserves a failing child exit code', () => {
  const { directory, run } = fixture({ exit: 7 });
  assert.equal(run('install').status, 7);
  assert.equal(readFileSync(join(directory, 'invoked.txt'), 'utf8'), `ci\n${join(directory, 'artifacts/npm-cache')}\n`);
});

test('help works without npm and rejects unknown commands', () => {
  const { directory, run } = fixture();
  assert.equal(run('--help').status, 0);
  assert.equal(run('unknown').status, 2);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});

test('malformed declarations cannot authorize installation', () => {
  const { directory, run } = fixture();
  writeFileSync(join(directory, 'configs/development/toolchain.json'), '{"node":null,"npm":"11.19.0"}');
  assert.equal(run('install').status, 1);
  assert.equal(existsSync(join(directory, 'invoked.txt')), false);
});
