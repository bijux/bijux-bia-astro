import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { inspectDocumentReferences } from '../../../scripts/deployment/document-references.mjs';

async function inspect(t, documents, assets = []) {
    const parent = path.resolve('artifacts/testing/document-references');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(path.join(parent, 'site-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const prefix = 'artifacts/dist/bioimage-archive/client/';
    const files = Object.fromEntries([...Object.keys(documents), ...assets].map(file => [prefix + file, 'fixture-hash']));
    for (const [file, content] of Object.entries(documents)) {
        await mkdir(path.dirname(path.join(root, prefix, file)), { recursive: true });
        await writeFile(path.join(root, prefix, file), content);
    }
    return inspectDocumentReferences(root, files, 'https://example.org');
}

test('generated documents resolve relative paths, encoded IDs, legacy named anchors and standalone HTML files', async t => {
    const result = await inspect(t, {
        'index.html': '<!doctype html><html><body><a href="study#record%26name">Record</a><a href="study/index.html#old">Legacy</a><a href="redirect_index.html#landing">Standalone</a><a href="#TOP">Top</a><a href="study#:~:text=Record">Text</a></body></html>',
        'study/index.html': '<!doctype html><html><head><link rel="stylesheet" href="../site.css?version=1&amp;mode=screen"></head><body><h2 id="record&amp;name">Record</h2><a name="old"></a><img src="../images/a%20b.svg"><script src="../app.mjs"></script></body></html>',
        'redirect_index.html': '<!doctype html><html><body><p id="landing">Landing</p></body></html>',
    }, ['site.css', 'images/a b.svg', 'app.mjs']);
    assert.deepEqual(result, { documents: 3, localResources: 3, generatedFragments: 3, deferredFragments: 0, failures: [] });
});

test('missing fragments and resources are failures even when every referenced document exists', async t => {
    const result = await inspect(t, {
        'index.html': '<!doctype html><html><head><link rel="stylesheet" href="missing.css"></head><body><a href="#absent">Missing</a><a href="other/#absent">Missing elsewhere</a><img src="/bioimage-archive/missing.svg"><img src="/missing.svg"><img src="http://[invalid"><a href="http://[invalid#section">Invalid</a><template><h2 id="absent">Inert</h2></template><script>"<h2 id=absent>Inert</h2>"</script></body></html>',
        'other/index.html': '<!doctype html><html><body><h2 id="present">Present</h2></body></html>',
    });
    assert.equal(result.failures.length, 7);
    assert(result.failures.includes('index.html: missing generated fragment /bioimage-archive/#absent'));
    assert(result.failures.includes('index.html: missing generated fragment /bioimage-archive/other/#absent'));
    assert(result.failures.includes('index.html: missing packaged resource /bioimage-archive/missing.css'));
    assert(result.failures.includes('index.html: missing packaged resource /bioimage-archive/missing.svg'));
    assert(result.failures.includes('index.html: missing packaged resource /missing.svg'));
    assert(result.failures.includes('index.html: invalid resource URL'));
    assert(result.failures.includes('index.html: invalid document link'));
});

test('external services and unbuilt routes remain separate from packaged document coverage', async t => {
    const result = await inspect(t, { 'index.html': '<!doctype html><html><head><link rel="canonical" href="https://example.org/bioimage-archive/"></head><body><img src="https://example.org/emdb/image.gif"><img src="//example.org/another-service/image.svg"><img src="https://external.example/image.svg"><a href="image/uuid#viewer">Server route</a><a href="https://external.example/#external">External</a></body></html>' });
    assert.deepEqual(result, { documents: 1, localResources: 0, generatedFragments: 0, deferredFragments: 1, failures: [] });
});

test('base URLs, source/poster attributes and document fragments retain native URL semantics', async t => {
    const result = await inspect(t, {
        'index.html': '<!doctype html><html><head><base href="/bioimage-archive/media/"></head><body><h2 id="elsewhere">Here</h2><video src="clip.mp4" poster="poster.png"><source src="clip.webm"><track src="captions.vtt"></video><a href="../index.html#elsewhere">Root</a></body></html>',
    }, ['media/clip.mp4', 'media/poster.png', 'media/clip.webm', 'media/captions.vtt']);
    assert.deepEqual(result, { documents: 1, localResources: 4, generatedFragments: 1, deferredFragments: 0, failures: [] });
});
