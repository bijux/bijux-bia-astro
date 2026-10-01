import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const scratch = resolve(root, 'artifacts/command-tests');
mkdirSync(scratch, { recursive: true });

test('default Make help has no application, install or network side effects', () => {
  const result = spawnSync('make', ['NPM=/nonexistent-sentinel'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /checked production build/);
});

test('every Make npm wrapper propagates exit-seven child failure', () => {
  const folder = mkdtempSync(resolve(scratch, 'failure-'));
  const stub = resolve(folder, 'npm-stub');
  writeFileSync(stub, '#!/bin/sh\nexit 7\n', { mode: 0o755 });
  for (const target of ['doctor', 'install', 'dev', 'build', 'preview', 'clean', 'check', 'test', 'report-test', 'report', 'report-check']) {
    const result = spawnSync('make', [target, `NPM=${stub}`, 'RECORD=sentinel.json', 'OUT=artifacts/sentinel'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0, target);
    assert.match(result.stderr, /Error 7/, target);
  }
});

test('public application scripts retain their original semantics', () => {
  const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json')));
  assert.equal(scripts.build, 'astro check && astro build && cp public/robots.txt dist/robots.txt && cp public/redirect_index.html dist/index.html');
  assert.equal(scripts.local, 'astro check && astro build && astro preview');
  assert.equal(scripts.prod, 'NODE_ENV=production PORT=8080 HOST=0.0.0.0 node dist/bioimage-archive/server/entry.mjs');
  assert.equal(scripts.dev, 'astro dev');
  assert.equal(scripts.start, 'astro dev');
  assert.equal(scripts.preview, 'astro preview');
});

function isolatedClean() {
  const folder = mkdtempSync(resolve(scratch, 'cleanup-'));
  mkdirSync(resolve(folder, 'scripts/development'), { recursive: true });
  writeFileSync(resolve(folder, 'scripts/development/clean.mjs'), readFileSync(resolve(root, 'scripts/development/clean.mjs')));
  assert.equal(spawnSync('git', ['init', '-q', folder]).status, 0);
  return folder;
}

test('cleanup preserves artifacts, source, user files and arbitrary hidden directories', () => {
  const folder = isolatedClean();
  for (const dir of ['dist', '.astro', '.netlify', 'artifacts', 'src', '.user']) {
    mkdirSync(resolve(folder, dir));
    writeFileSync(resolve(folder, dir, 'sentinel'), 'preserve');
  }
  writeFileSync(resolve(folder, 'user.txt'), 'preserve');
  const result = spawnSync(process.execPath, ['scripts/development/clean.mjs'], { cwd: folder, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const dir of ['dist', '.astro', '.netlify']) assert.equal(existsSync(resolve(folder, dir)), false);
  for (const dir of ['artifacts', 'src', '.user']) assert.equal(readFileSync(resolve(folder, dir, 'sentinel'), 'utf8'), 'preserve');
  assert.equal(readFileSync(resolve(folder, 'user.txt'), 'utf8'), 'preserve');
});

test('cleanup rejects tracked output before deleting anything', () => {
  const folder = isolatedClean();
  mkdirSync(resolve(folder, 'dist'));
  mkdirSync(resolve(folder, '.astro'));
  writeFileSync(resolve(folder, '.astro/source'), 'tracked');
  assert.equal(spawnSync('git', ['-C', folder, 'add', '.astro/source']).status, 0);
  const result = spawnSync(process.execPath, ['scripts/development/clean.mjs'], { cwd: folder, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(resolve(folder, 'dist')), true);
  assert.equal(readFileSync(resolve(folder, '.astro/source'), 'utf8'), 'tracked');
});

test('cleanup rejects a symlink without touching its target', () => {
  const folder = isolatedClean();
  mkdirSync(resolve(folder, 'user'));
  writeFileSync(resolve(folder, 'user/sentinel'), 'preserve');
  symlinkSync('user', resolve(folder, 'dist'));
  const result = spawnSync(process.execPath, ['scripts/development/clean.mjs'], { cwd: folder, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(resolve(folder, 'user/sentinel'), 'utf8'), 'preserve');
});
