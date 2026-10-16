import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const boundary = fileURLToPath(new URL('../../support/website/runtime-boundary.mjs', import.meta.url));
const execute = promisify(execFile);

test('the production gate rejects ancestor package fallback in ESM and CommonJS and linked files while retaining local modules', async t => {
    const output = await ownedDirectory(repository, 'artifacts/testing/runtime-boundary');
    const root = await mkdtemp(path.join(output, 'package-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const application = path.join(root, 'application');
    await mkdir(application);
    await mkdir(path.join(root, 'node_modules/ancestor-only'), { recursive: true });
    await writeFile(path.join(root, 'node_modules/ancestor-only/package.json'), '{"main":"index.cjs"}');
    await writeFile(path.join(root, 'node_modules/ancestor-only/index.cjs'), 'module.exports = "borrowed";');
    await writeFile(path.join(application, 'local.mjs'), 'export default "packaged";');
    await writeFile(path.join(root, 'outside.mjs'), 'export default "outside";');
    await symlink(path.join(root, 'outside.mjs'), path.join(application, 'linked.mjs'));
    await writeFile(path.join(application, 'probe.mjs'), `
import { createRequire } from 'node:module';
if (process.argv[2] === 'esm') await import('ancestor-only');
else if (process.argv[2] === 'cjs') createRequire(import.meta.url)('ancestor-only');
else if (process.argv[2] === 'relative') await import('../outside.mjs');
else if (process.argv[2] === 'linked') await import('./linked.mjs');
else console.log((await import('./local.mjs')).default);
`);
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const options = { cwd: application, env, timeout: 15000, maxBuffer: 1024 * 1024 };
    for (const mode of ['esm', 'cjs', 'relative', 'linked']) {
        // Demonstrate the otherwise silent fallback using the exact same process.
        await execute(process.execPath, ['probe.mjs', mode], options);
        await assert.rejects(execute(process.execPath, ['--import', boundary, 'probe.mjs', mode], options),
            error => error.code === 1 && /Production module escaped its package:/.test(error.stderr));
    }
    const local = await execute(process.execPath, ['--import', boundary, 'probe.mjs', 'local'], options);
    assert.equal(local.stdout.trim(), 'packaged');
});
