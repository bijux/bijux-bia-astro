import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDocumentReferences } from './document-references.mjs';
import { deploymentConfiguration } from '../../src/server/deployment.mjs';
import { ownedDirectory } from '../filesystem/owned-directory.mjs';
import { writeFileAtomically } from '../filesystem/atomic-file.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = root => join(root, 'artifacts/deployment/manifest.json');

async function inventory(root, directory = join(root, 'artifacts/dist')) {
    if (!(await lstat(directory)).isDirectory()) throw new Error('Deployment directories must not be symbolic links.');
    const files = {};
    for (const name of (await readdir(directory)).sort()) {
        const file = join(directory, name);
        const stat = await lstat(file);
        if (stat.isDirectory()) Object.assign(files, await inventory(root, file));
        else if (stat.isFile()) files[relative(root, file).split(sep).join('/')] = createHash('sha256').update(await readFile(file)).digest('hex');
        else throw new Error('Deployment output must contain only regular files and directories.');
    }
    return files;
}

async function catalogueProvenance(root) {
    let value;
    try { value = JSON.parse(await readFile(join(root, 'artifacts/deployment/catalogue.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    if (!value || !/^[a-f0-9]{64}$/.test(value.snapshotHash) || ![value.studies, value.responses].every(count => Number.isSafeInteger(count) && count >= 0)) throw new Error('Invalid catalogue deployment provenance.');
    return value;
}

/** Seal only a completed Node build; the manifest is outside the public document root. */
export async function sealDeployment(root, configuration) {
    await ownedDirectory(root, 'artifacts');
    const files = await inventory(root);
    for (const name of ['bioimage-archive/server/entry.mjs', 'bioimage-archive/client/index.html', 'index.html', 'robots.txt']) {
        if (!files[`artifacts/dist/${name}`]) throw new Error(`Deployment is missing ${name}.`);
    }
    const references = await inspectDocumentReferences(root, files, configuration.SITE_URL);
    if (references.failures.length) throw new Error(`Deployment document references failed:\n${references.failures.join('\n')}`);
    const manifest = { configuration, files, catalogue: await catalogueProvenance(root), references };
    await ownedDirectory(root, 'artifacts/deployment');
    await writeFileAtomically(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}

/** Verify the packaged output once, after copying it into its deployment image. */
export async function verifyDeployment(root = repository) {
    const manifest = JSON.parse(await readFile(manifestPath(root), 'utf8'));
    await deploymentConfiguration(manifestPath(root), {});
    if (JSON.stringify(manifest.catalogue) !== JSON.stringify(await catalogueProvenance(root))) throw new Error('Catalogue provenance differs from the verified deployment.');
    const files = await inventory(root);
    if (!manifest.files || JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Deployment files differ from the verified build.');
    return manifest;
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv[2] !== 'verify') throw new Error('Expected: manifest.mjs verify');
    await verifyDeployment();
}
