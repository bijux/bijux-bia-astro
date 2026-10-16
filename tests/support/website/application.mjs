import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HtmlValidate } from 'html-validate';
import { withCategoryBoundaries } from '../../fixtures/scenarios/spora-categories.mjs';
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(repository, 'artifacts/website-verification');
export const buildRoot = path.join(output, 'application');
const preload = pathToFileURL(path.join(buildRoot, 'tests/fixtures/website/preload.mjs')).href;
export const env = { ...process.env, NETLIFY: 'false', NETLIFY_DEV: 'false', AWS_LAMBDA_FUNCTION_NAME: '', PUBLIC_SEARCH_API: 'https://alpha.bioimagearchive.org/search/v1', PUBLIC_MONGO_API: 'https://metadata-fixture.example.org/api/v2/', PUBLIC_GTAG: '', PUBLIC_WEBSITE_STATE: 'PROD', PUBLIC_ALLOW_LOCAL_VIEWERS: 'false', SITE_URL: 'http://localhost', NODE_OPTIONS: `--import=${preload}`, ASTRO_TELEMETRY_DISABLED: '1' };
delete env.CATALOGUE_SNAPSHOT;
async function run(args) {
    const child = spawn(process.execPath, args, { cwd: buildRoot, env, stdio: 'inherit' });
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, `Verification subprocess failed: ${signal ?? code}`);
}

export default async function prepareWebsite() {
    await ownedDirectory(repository, 'artifacts/website-verification');
    await rm(path.join(output, 'report.json'), { force: true });
    await rm(buildRoot, { recursive: true, force: true });
    await mkdir(buildRoot, { recursive: true });
    for (const name of ['src', 'public', 'scripts', 'tests/fixtures', 'package.json', 'package-lock.json', 'tsconfig.json']) await cp(path.join(repository, name), path.join(buildRoot, name), { recursive: true });
    const catalogue = path.join(buildRoot, 'src/data/collections/spora-datasets.json');
    await writeFile(catalogue, JSON.stringify(withCategoryBoundaries(JSON.parse(await readFile(catalogue, 'utf8')))));
    const contract = JSON.parse(await readFile(path.join(repository, 'tests/fixtures/website/production-contract.json'), 'utf8'));
    const spatialomics = path.join(buildRoot, 'src/data/collections/spatialomics.json');
    const collection = JSON.parse(await readFile(spatialomics, 'utf8'));
    assert(contract.spatialomicsStudies.every(id => collection.accession_ids.includes(id)), 'Representative studies must belong to the curated collection.');
    collection.accession_ids = contract.spatialomicsStudies;
    await writeFile(spatialomics, JSON.stringify(collection));
    const pages = contract.pageSources;
    await rm(path.join(buildRoot, 'src/pages'), { recursive: true });
    for (const page of pages) {
        await mkdir(path.dirname(path.join(buildRoot, 'src/pages', page)), { recursive: true });
        await cp(path.join(repository, 'src/pages', page), path.join(buildRoot, 'src/pages', page));
    }
    await symlink(path.join(repository, 'node_modules'), path.join(buildRoot, 'node_modules'), 'dir');
    await writeFile(path.join(buildRoot, 'astro.config.mjs'), `import config from ${JSON.stringify(pathToFileURL(path.join(repository, 'astro.config.mjs')).href)};\nexport default {...config,root:${JSON.stringify(buildRoot)}};\n`);
    await run(['scripts/deployment/build.mjs']);
    const html = new HtmlValidate(JSON.parse(await readFile(path.join(repository, 'configs/audits/markup/htmlvalidate.json'), 'utf8')));
    const generated = [];
    async function validate(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await validate(file);
            else if (entry.name.endsWith('.html')) {
                const result = await html.validateFile(file);
                assert(result.valid, JSON.stringify(result.results));
                generated.push(path.relative(path.join(buildRoot, 'artifacts/dist/bioimage-archive/client'), file).split(path.sep).join('/'));
            }
        }
    }
    await validate(path.join(buildRoot, 'artifacts/dist/bioimage-archive/client'));
    assert.deepEqual(generated.sort(), [...contract.generatedHtml].sort(), 'Generated routes differ from the production contract.');
    for (const route of contract.serverRoutes) {
        const pathname = new URL(route, 'http://local').pathname;
        assert(!generated.includes(`${pathname.slice(1)}/index.html`), `Server route was unexpectedly prerendered: ${pathname}`);
    }

    await writeFile(path.join(output, 'report.json'), JSON.stringify({ generatedHtml: generated.length, generatedRoutes: generated, serverRoutes: contract.serverRoutes, externalExclusions: ['EMBL chrome/styles', 'analytics', 'images/fonts', 'external file-browser document'] }, null, 2) + '\n');
}
