import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareArtifacts } from "../../../scripts/build/artifacts.mjs";
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';

async function fixture(t) {
    const output = fileURLToPath(new URL("../../../artifacts/artifact-layout-tests/", import.meta.url));
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, 'checkout-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    return root;
}

test('generated directories move intact, repeated preparation is safe, and npm replacement installs take precedence', async t => {
    const root = await fixture(t);
    for (const name of ['node_modules', '.astro', '.netlify']) {
        await mkdir(path.join(root, name));
        await writeFile(path.join(root, name, 'retained'), name);
    }
    await prepareArtifacts(root);
    await prepareArtifacts(root);
    for (const [name, target] of [['node_modules', 'node_modules'], ['.astro', 'astro'], ['.netlify', 'netlify']]) {
        assert.equal(await readlink(path.join(root, name)), `artifacts/${target}`);
        assert.equal(await readFile(path.join(root, 'artifacts', target, 'retained'), 'utf8'), name);
    }
    await unlink(path.join(root, 'node_modules'));
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'node_modules', 'installed'), 'locked installation');
    await prepareArtifacts(root);
    assert.equal(await readFile(path.join(root, 'node_modules', 'installed'), 'utf8'), 'locked installation');
    await assert.rejects(readFile(path.join(root, 'artifacts/node_modules/retained')), { code: 'ENOENT' });
});

for (const surface of ['artifacts', 'node_modules', 'artifacts/node_modules']) {
    test(`unexpected ${surface} symlinks cannot redirect artifact writes`, async t => {
        const root = await fixture(t);
        const foreign = await fixture(t);
        await writeFile(path.join(foreign, 'retained'), 'untouched');
        await mkdir(path.dirname(path.join(root, surface)), { recursive: true });
        await symlink(foreign, path.join(root, surface), 'dir');
        await assert.rejects(prepareArtifacts(root), /real directory|Unexpected/);
        assert.equal(await readFile(path.join(foreign, 'retained'), 'utf8'), 'untouched');
    });
}

test('owned output creates nested directories idempotently and rejects escaping or ambiguous paths', async t => {
    const root = await fixture(t);
    const target = await ownedDirectory(root, 'artifacts/testing/output');
    assert.equal(await ownedDirectory(root, 'artifacts/testing/output'), target);
    assert.equal(target, path.join(root, 'artifacts/testing/output'));
    for (const name of ['', '..', 'artifacts/../outside', '/outside', 'artifacts//output', 'artifacts/./output', 'artifacts\\output', 'artifacts/\0']) {
        await assert.rejects(ownedDirectory(root, name), /relative path/);
    }
});

for (const surface of ['artifacts', 'artifacts/testing', 'artifacts/testing/output']) {
    test(`owned output rejects linked ${surface} without modifying its target`, async t => {
        const root = await fixture(t);
        const foreign = await fixture(t);
        await writeFile(path.join(foreign, 'retained'), 'untouched');
        await mkdir(path.dirname(path.join(root, surface)), { recursive: true });
        await symlink(foreign, path.join(root, surface), 'dir');
        await assert.rejects(ownedDirectory(root, 'artifacts/testing/output'), /real directory/);
        assert.equal(await readFile(path.join(foreign, 'retained'), 'utf8'), 'untouched');
        await assert.rejects(readFile(path.join(foreign, 'output')), { code: 'ENOENT' });
    });
}

test('owned output rejects files and a symlinked root', async t => {
    const root = await fixture(t);
    await writeFile(path.join(root, 'artifacts'), 'retained');
    await assert.rejects(ownedDirectory(root, 'artifacts/output'), /real directory/);
    assert.equal(await readFile(path.join(root, 'artifacts'), 'utf8'), 'retained');
    const parent = await fixture(t);
    await symlink(root, path.join(parent, 'checkout'), 'dir');
    await assert.rejects(ownedDirectory(path.join(parent, 'checkout'), 'artifacts'), /real directory/);
});
