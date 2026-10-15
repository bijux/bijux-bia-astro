import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HtmlValidate } from 'html-validate';

export const repository = fileURLToPath(new URL('../../', import.meta.url));
export const output = path.join(repository, 'artifacts/website-verification');
export const root = path.join(output, 'application');
const preload = pathToFileURL(path.join(root, 'tests/fixtures/website/preload.mjs')).href;
export const env = { ...process.env, NETLIFY: 'false', NETLIFY_DEV: 'false', AWS_LAMBDA_FUNCTION_NAME: '', PUBLIC_SEARCH_API: 'https://alpha.bioimagearchive.org/search/v1', PUBLIC_MONGO_API: 'https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2', PUBLIC_GTAG: '', PUBLIC_WEBSITE_STATE: 'PROD', PUBLIC_ALLOW_LOCAL_VIEWERS: 'false', SITE_URL: 'http://localhost', NODE_OPTIONS: `--import=${preload}`, ASTRO_TELEMETRY_DISABLED: '1' };
delete env.CATALOGUE_SNAPSHOT;
async function run(args) {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, `Verification subprocess failed: ${signal ?? code}`);
}

export default async function prepareWebsite() {
    await mkdir(output, { recursive: true });
    await rm(path.join(output, 'report.json'), { force: true });
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    for (const name of ['src', 'public', 'scripts', 'tests/fixtures', 'package.json', 'package-lock.json', 'tsconfig.json']) await cp(path.join(repository, name), path.join(root, name), { recursive: true });
    const pages = ['index.astro', 'images.astro', 'studies.astro', 'study/[accessionID].astro', 'projects/spora/dataset.astro', 'projects/spora.astro', 'help/downloading-data.mdx', 'help/search.mdx', 'contact-us.md', 'case-studies.astro', 'image/[uuid].astro', 'galleries/volumeem.astro', 'galleries/ai/image/[uuid].astro', 'galleries/spatialomics/image/[uuid].astro', 'galleries/ai/model/[modelName].astro'];
    await rm(path.join(root, 'src/pages'), { recursive: true });
    for (const page of pages) {
        await mkdir(path.dirname(path.join(root, 'src/pages', page)), { recursive: true });
        await cp(path.join(repository, 'src/pages', page), path.join(root, 'src/pages', page));
    }
    await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    await writeFile(path.join(root, 'astro.config.mjs'), `import config from ${JSON.stringify(pathToFileURL(path.join(repository, 'astro.config.mjs')).href)};\nexport default {...config,root:${JSON.stringify(root)}};\n`);
    await run(['scripts/deployment/build.mjs']);
    const html = new HtmlValidate(JSON.parse(await readFile(path.join(repository, 'configs/quality/htmlvalidate.markup.json'), 'utf8')));
    let generated = 0;
    async function validate(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await validate(file);
            else if (entry.name.endsWith('.html')) {
                const result = await html.validateFile(file);
                assert(result.valid, JSON.stringify(result.results));
                generated++;
            }
        }
    }
    await validate(path.join(root, 'artifacts/dist/bioimage-archive/client'));
    assert(generated >= 4, 'Representative static routes were not generated.');

    await writeFile(path.join(output, 'report.json'), JSON.stringify({ generatedHtml: generated, externalExclusions: ['EMBL chrome/styles', 'analytics', 'images/fonts', 'external file-browser document'] }, null, 2) + '\n');
}
