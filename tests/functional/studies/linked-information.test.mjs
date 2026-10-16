import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HtmlValidate } from 'html-validate';
import { createAstroFixture, buildAstroFixture } from '../../support/astro/fixture.mjs';

let root;
const rendered = new Map();
const capture = JSON.parse(await readFile(new URL('../../fixtures/api/study-s-biad3335-response.json', import.meta.url))).hits.hits[0]._source;
const names = ['BIOSTUDIES', 'https', 'ArrayExpress', 'EMPIAR', 'constructor', '__proto__', 'toString', '<custom> & "literal"'];
const links = [...capture.see_also, ...names.map(link_type => ({ link_type, description: `Description ${link_type}`,
    link: `https://example.org/related?type=${encodeURIComponent(link_type)}&view=full` }))];
const pdbLinks = '<a href="https://www.ebi.ac.uk/pdbe/entry/pdb/1abc">1abc</a>';
const emdbLinks = '<a href="https://www.ebi.ac.uk/emdb/EMD-1234">EMD-1234</a>';
const cases = {
    labels: { seeAlso: links }, absent: { pdbLinks }, null: { seeAlso: null, emdbLinks },
    malformed: { seeAlso: {}, pdbLinks, emdbLinks }, empty: { seeAlso: [], pdbLinks },
    none: {}, replaced: { seeAlso: [{ link_type: 'pdb', link: 'https://example.org/raw-pdb' },
        { link_type: 'emdb', link: 'https://example.org/raw-emdb' }], pdbLinks, emdbLinks },
};
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });
before(async () => {
    root = await createAstroFixture('study-linked-information', ['src/features/studies/LinkedInformation.astro', 'src/security']);
    await writeFile(path.join(root, 'src/cases.json'), JSON.stringify(cases));
    await writeFile(path.join(root, 'src/pages/index.astro'), `---
import LinkedInformation from '../features/studies/LinkedInformation.astro';
import cases from '../cases.json';
---
<!DOCTYPE html><html lang="en"><head><title>Study links</title></head><body><main>
{Object.entries(cases).map(([id, props]) => <article id={id}><LinkedInformation {...props} /></article>)}
</main></body></html>`);
    await buildAstroFixture(root);
    const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
    // Each article represents a separate study page with its stable section anchor.
    for (const match of html.matchAll(/<article id="([^"]+)">([\s\S]*?)<\/article>/g)) rendered.set(match[1], match[2]);
});

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
test('captured links and unknown type labels retain their text, order and approved destinations', () => {
    const html = rendered.get('labels');
    const labels = [...html.matchAll(/<b>([\s\S]*?)\.<\/b>/g)].map(match => match[1]);
    assert.deepEqual(labels, ['BioStudies', 'HTTPS', 'ArrayExpress', 'EMPIAR', ...names.slice(4).map(escape)]);
    for (const link of links) {
        assert(html.includes(`href="${escape(link.link)}"`));
        assert(html.includes(`${escape(link.description)}:`));
    }
    assert.doesNotMatch(html, /\[native code\]|\[object Object\]/);
});

test('legacy entry previews render without a see_also array and absent information adds no section', async () => {
    const validator = new HtmlValidate({ extends: ['html-validate:recommended'], rules: { 'no-inline-style': 'off' } });
    for (const [id, values] of Object.entries(cases)) {
        const html = rendered.get(id);
        if (id === 'none') { assert.equal(html, ''); continue; }
        for (const preview of [values.pdbLinks, values.emdbLinks].filter(Boolean)) assert(html.includes(preview), id);
        const result = await validator.validateString(`<!DOCTYPE html><html lang="en"><head><title>Study</title></head><body><main>${html}</main></body></html>`);
        assert.equal(result.valid, true, JSON.stringify(result.results));
    }
});

test('the specific PDB and EMDB previews retain ownership of their existing destinations', () => {
    const html = rendered.get('replaced');
    assert(html.includes(pdbLinks)); assert(html.includes(emdbLinks));
    assert.doesNotMatch(html, /example.org\/raw-/);
});
