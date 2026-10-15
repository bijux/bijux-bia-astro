import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfiguration, publicDefaults } from './configuration.mjs';

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

/** Seal only a completed Node build; the manifest is outside the public document root. */
export async function sealDeployment(root, configuration) {
    const files = await inventory(root);
    for (const name of ['bioimage-archive/server/entry.mjs', 'bioimage-archive/client/index.html', 'index.html', 'robots.txt']) {
        if (!files[`artifacts/dist/${name}`]) throw new Error(`Deployment is missing ${name}.`);
    }
    const manifest = { configuration, files };
    await mkdir(dirname(manifestPath(root)), { recursive: true });
    await writeFile(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}

/** Verify the packaged output once, after copying it into its deployment image. */
export async function verifyDeployment(root = repository) {
    const manifest = JSON.parse(await readFile(manifestPath(root), 'utf8'));
    await deploymentConfiguration(manifestPath(root), {});
    const files = await inventory(root);
    if (!manifest.files || JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Deployment files differ from the verified build.');
    return manifest;
}

/** Reject ineffective runtime overrides instead of silently serving the previous configuration. */
export async function deploymentConfiguration(file, environment = process.env) {
    const { configuration } = JSON.parse(await readFile(file, 'utf8'));
    if (!configuration || Object.keys(configuration).length !== Object.keys(publicDefaults).length || Object.keys(publicDefaults).some(name => typeof configuration[name] !== 'string')) throw new Error('Invalid deployment configuration.');
    const validated = buildConfiguration(configuration);
    if (Object.entries(validated).some(([name, value]) => value !== configuration[name])) throw new Error('Invalid deployment configuration.');
    for (const [name, value] of Object.entries(configuration)) {
        if (environment[name] !== undefined && environment[name] !== value) throw new Error(`${name} is fixed at build time; rebuild the deployment to change it.`);
    }
    return configuration;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv[2] !== 'verify') throw new Error('Expected: manifest.mjs verify');
    await verifyDeployment();
}
