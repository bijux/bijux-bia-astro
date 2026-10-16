import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const repository = new URL("../../../../", import.meta.url);

test('Knip reaches workers, copied fixtures and Playwright setup without hiding unused files', async () => {
  const output = new URL('artifacts/knip-integration/', repository);
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(new URL('application-', output).pathname);
  try {
    const original = JSON.parse(await readFile(new URL('configs/audits/dead-code/knip.json', repository)));
    // Use the repository's actual optional entry/config patterns, with a minimal
    // import graph that exposes omissions as unreachable files/dependencies.
    const config = { project: ['scripts/**/*.{mjs,ts}', 'configs/**/*.{mjs,ts}', 'tests/**/*.{mjs,ts}'], playwright: original.playwright, ignoreBinaries: original.ignoreBinaries, entry: original.entry.filter(entry => entry.includes('scripts/audits/markup/') || entry.includes("tests/fixtures/metadata/")), eslint: original.eslint };
    for (const dir of ['scripts/audits/markup', 'configs/audits/markup', 'configs/testing', 'tests/support/website', 'tests/e2e', "tests/fixtures/metadata"]) await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'audit:markup': 'node scripts/audits/markup/audit.mjs' }, devDependencies: { eslint: '9.39.5', 'eslint-plugin-astro': '1.3.1', '@playwright/test': '1.64.1' } }));
    await writeFile(path.join(root, 'knip.json'), JSON.stringify(config));
    await writeFile(path.join(root, 'configs/testing/playwright.config.ts'), await readFile(new URL('configs/testing/playwright.config.ts', repository)));
    await writeFile(path.join(root, 'tests/support/website/delivery.mjs'), "import './delivery-helper.mjs'; export default async function setup() {}\n");
    await writeFile(path.join(root, 'tests/support/website/delivery-helper.mjs'), 'console.log("setup dependency");\n');
    await writeFile(path.join(root, 'tests/support/website/unreachable.mjs'), 'export const unused = true;\n');
    await writeFile(path.join(root, 'tests/e2e/website.spec.ts'), "import { test } from '@playwright/test'; test('website', () => {});\n");
    await writeFile(path.join(root, 'scripts/audits/markup/audit.mjs'), "import { spawn } from 'node:child_process'; spawn(process.execPath, [new URL('./worker.mjs', import.meta.url).pathname]);\n");
    await writeFile(path.join(root, 'scripts/audits/markup/worker.mjs'), "import './worker-helper.mjs';\n");
    await writeFile(path.join(root, 'configs/audits/markup/eslint.config.mjs'), "import astro from 'eslint-plugin-astro'; export default [...astro.configs['flat/base']];\n");
    await writeFile(path.join(root, "tests/fixtures/metadata/dataset-metadata.mjs"), "import './record-helper.mjs';\n");
    await writeFile(path.join(root, "tests/fixtures/metadata/record-helper.mjs"), 'console.log("compiled fixture dependency");\n');
    await writeFile(path.join(root, 'scripts/audits/markup/worker-helper.mjs'), "import { spawnSync } from 'node:child_process'; spawnSync('mkfifo', []); spawnSync('unprovided-tool', []); import { State, Mode } from './symbols.ts'; console.log(State.used, Mode.used);\n");
    await writeFile(path.join(root, 'scripts/audits/markup/symbols.ts'), 'export namespace State { export const used = 1; export const old = 2; } export enum Mode { used, old }\n');
    const packageFile = fileURLToPath(new URL('../../../../node_modules/knip/package.json', import.meta.url));
    const info = JSON.parse(await readFile(packageFile));
    const cli = path.join(path.dirname(packageFile), info.bin.knip);
    const result = await promisify(execFile)(process.execPath, [cli, '--config', 'knip.json', '--reporter', 'json'], { cwd: root, timeout: 30000 }).catch(error => {
      if (error.code !== 1) throw error;
      return error;
    });
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.issues.filter(row => row.files?.length).map(row => path.isAbsolute(row.file) ? path.relative(root, row.file) : row.file), ['tests/support/website/unreachable.mjs'], result.stdout);
    assert.deepEqual(report.issues.flatMap(row => row.binaries ?? []).map(item => item.name), ['unprovided-tool']);
    const symbols = report.issues.find(row => row.file === 'scripts/audits/markup/symbols.ts');
    assert(symbols?.namespaceMembers?.some(item => item.namespace === 'State' && item.name === 'old'), result.stdout);
    assert(symbols?.enumMembers?.some(item => item.name === 'old'), result.stdout);
    assert(!report.issues?.some(issue => issue.exports?.some(value => value.name === 'default')), result.stdout);
    assert(!report.issues?.some(issue => [...(issue.dependencies ?? []), ...(issue.devDependencies ?? [])].some(item => item.name === 'eslint-plugin-astro')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
