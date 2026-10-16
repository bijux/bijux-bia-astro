import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const execute = promisify(execFile);

for (const [entry, link, invocation] of [
    ['scripts/deployment/build.mjs', 'artifacts', ''],
    ['scripts/catalogue/build.mjs', 'artifacts', ''],
    ['scripts/catalogue/build.mjs', 'artifacts/catalogue', ''],
    ['scripts/audits/dead-code/audit.mjs', 'artifacts', ''],
    ['scripts/audits/markup/audit.mjs', 'artifacts/markup', ''],
    ['scripts/audits/markup/worker.mjs', 'artifacts/markup', ''],
    ['scripts/audits/security/audit.mjs', 'artifacts/security', ''],
    ['tests/support/website/application.mjs', 'artifacts/website-verification', 'await module.default()'],
    ['tests/support/astro/fixture.mjs', 'artifacts/testing', "await module.createAstroFixture('output')"],
]) {
    test(`${entry} refuses linked ${link} before modifying external output`, async t => {
        const parent = await ownedDirectory(repository, 'artifacts/testing/output-ownership');
        const run = await mkdtemp(path.join(parent, 'checkout-'));
        t.after(() => rm(run, { recursive: true, force: true }));
        const root = path.join(run, 'repository');
        const foreign = path.join(run, 'outside');
        await mkdir(root);
        await mkdir(foreign);
        for (const name of ['deployment', 'application']) {
            await mkdir(path.join(foreign, name));
            await writeFile(path.join(foreign, name, 'retained'), 'untouched');
        }
        for (const directory of ['scripts', 'src/server', 'tests/support']) {
            await cp(path.join(repository, directory), path.join(root, directory), { recursive: true });
        }
        await cp(path.join(repository, 'package.json'), path.join(root, 'package.json'));
        await mkdir(path.dirname(path.join(root, link)), { recursive: true });
        await symlink(foreign, path.join(root, link), 'dir');
        const code = `const module = await import(${JSON.stringify(pathToFileURL(path.join(root, entry)).href)}); ${invocation}`;
        await assert.rejects(execute(process.execPath, ['--input-type=module', '--eval', code], {
            cwd: root, timeout: 10000,
        }), error => /real directory|evidence storage is unsafe/.test(error.stderr));
        assert.deepEqual((await readdir(foreign)).sort(), ['application', 'deployment']);
        for (const name of ['deployment', 'application']) {
            assert.equal(await readFile(path.join(foreign, name, 'retained'), 'utf8'), 'untouched');
        }
    });
}
