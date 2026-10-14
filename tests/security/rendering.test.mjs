import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const layouts = ["BaseLayout", "EMPIARLayout", "MinimalLayout", "ProjectsLayout"];
const payload = '"></ScRiPt><script data-security-probe="script">inert</script> & " | µ\u2028\u2029';
const markup = '<b data-security-probe="metadata">literal | µ</b>';
const rendered = new Map();
let root;

after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

before(async () => {
    const output = path.join(repository, "artifacts/security/rendering-fixtures");
    await mkdir(output, { recursive: true });
    root = await mkdtemp(path.join(output, "application-"));
    await cp(path.join(repository, "src"), path.join(root, "src"), {
        recursive: true,
        filter: source => source !== path.join(repository, "src/pages"),
    });
    await mkdir(path.join(root, "src/pages"), { recursive: true });
    await symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
    await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
    await writeFile(path.join(root, "astro.config.mjs"), `
import { defineConfig, envField } from 'astro/config';
export default defineConfig({ cacheDir: './.astro-cache', vite: { cacheDir: './.vite-cache' }, env: { schema: {
    PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: 'http://127.0.0.1:1' }),
    PUBLIC_GTAG: envField.string({ access: 'public', context: 'client', default: ${JSON.stringify(payload)} }),
    PUBLIC_WEBSITE_STATE: envField.string({ access: 'public', context: 'client', default: 'DEV' })
} } });
`);
    for (const layout of layouts) {
        await writeFile(path.join(root, "src/pages", `${layout}.astro`), `---
import Layout from '../layouts/${layout}.astro';
import HighlightedText from '../components/HighlightedText.astro';
import HighlightedTaxa from '../components/HighlightedTaxa.astro';
import HighlightedFields from '../components/HighlightedFields.astro';
import DatasetDetail from '../components/DatasetDetail.astro';
import { scriptData } from '../security/html.mjs';
const payload = ${JSON.stringify(payload)};
const markup = ${JSON.stringify(markup)};
---
<Layout pageTitle="Security rendering" projectTitle="Security rendering">
    <section id="highlight"><HighlightedText text={'__HIT__' + markup + '__/HIT__'} /></section>
    <section id="taxa"><HighlightedTaxa query="Mus" record={{ organism_classification: [{ scientific_name: 'Mus ' + markup, common_name: 'Mouse' }] }} /></section>
    <section id="fields"><HighlightedFields highlights={{ description: markup, title: 'Excluded title' }} /></section>
    <section id="metadata"><DatasetDetail data={{ title: 'Repeated record', default_open: false, description: markup }} fieldMap={{ description: 'Description' }} /></section>
    <script type="application/json" id="security-json" set:html={scriptData({ payload })} />
</Layout>
`);
    }
    const image = JSON.parse(await readFile(path.join(repository, 'tests/fixtures/api/image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json'), 'utf8')).hits.hits[0]._source;
    const study = JSON.parse(await readFile(path.join(repository, 'tests/fixtures/api/study-s-biad3335-response.json'), 'utf8')).hits.hits[0]._source;
    for (const record of [image, study]) record.licence_details = {uri:'javascript:window.probe=1', logo_uri:'http://127.0.0.1/private.svg'};
    study.example_image_uri = ['javascript:window.probe=1'];
    await writeFile(path.join(root, 'src/pages/cards.astro'), `---
import StudyCard from '../components/cards/BrowseStudyCard.astro';
import ImageCard from '../components/cards/BrowseImageCard.astro';
import { getStudyImage, getLicenceLogo } from '../components/SharedJSFunctions.js';
const study = ${JSON.stringify(study)};
const image = ${JSON.stringify(image)};
---
<StudyCard study={study} studyPageRoot="study" /><ImageCard image={image} imagePageRoot="image" />
<p id="safe-logo">{getLicenceLogo('https://creativecommons.org/licenses/by/4.0/')}</p>
<img id="authored-hero" src={getStudyImage(study, '/bioimage-archive/ai-galleries/model-images/loyal-squid_combined.png')} />
`);
    await promisify(execFile)(process.execPath,
        [path.join(repository, "node_modules/astro/astro.js"), "build", "--root", root],
        { cwd: root, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, PUBLIC_GTAG: payload, PUBLIC_SEARCH_API: "http://127.0.0.1:1" } });
    for (const layout of layouts) rendered.set(layout, await readFile(path.join(root, "dist", layout, "index.html"), "utf8"));
    rendered.set('cards', await readFile(path.join(root, 'dist/cards/index.html'), 'utf8'));
});

for (const layout of layouts) {
    test(`${layout} compiles actual security consumers and keeps script data inert`, () => {
        const html = rendered.get(layout);
        for (const [id, expected] of [["analytics-configuration", { id: payload }], ["security-json", { payload }]]) {
            const blocks = [...html.matchAll(new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/script>`, "g"))];
            assert.equal(blocks.length, 1, id);
            assert.deepEqual(JSON.parse(blocks[0][1]), expected);
            assert.doesNotMatch(blocks[0][1], /[<>&\u2028\u2029]/);
        }
        assert.deepEqual(html.match(/<(?:script|b)\b[^>]*\sdata-security-probe\s*=/g) ?? [], []);
        const source = html.match(/src="(https:\/\/www\.googletagmanager\.com\/gtag\/js\?[^"]+)"/)[1];
        assert.equal(new URL(source).searchParams.get("id"), payload);
        const sections = Object.fromEntries([...html.matchAll(/<section id="(highlight|taxa|fields|metadata)">([\s\S]*?)<\/section>/g)].map(match => [match[1], match[2]]));
        for (const name of ["highlight", "taxa", "fields", "metadata"]) {
            assert(sections[name].includes("&lt;b data-security-probe="), name);
            assert(sections[name].includes("literal | µ"), name);
        }
        assert.match(sections.highlight, /<mark[^>]*>&lt;b/);
        assert.match(sections.taxa, /<i>\s*<span[^>]*>\s*<mark[^>]*>Mus<\/mark>/);
        assert.match(sections.taxa, /Mouse/);
        assert.match(sections.metadata, /\(as above\)/);
        assert.doesNotMatch(sections.metadata, /<details[^>]*\bopen\b/);
        assert.doesNotMatch(sections.fields, /Excluded title/);
    });
}

test('actual search cards reject executable licence links and local remote images while retaining owned fallback assets', () => {
    const html = rendered.get('cards');
    assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|http:\/\/127\.0\.0\.1)/);
    assert.match(html, /src="\/bioimage-archive\/default-hero\/placeholder_logo_\d+\.png"/);
    assert.match(html, /https:\/\/mirrors\.creativecommons\.org\/presskit\/buttons\/88x31\/svg\/by\.svg/);
    assert.match(html, /src="\/bioimage-archive\/ai-galleries\/model-images\/loyal-squid_combined\.png"/);
});
