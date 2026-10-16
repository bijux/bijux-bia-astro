import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from '@astrojs/compiler';
import ts from 'typescript';
import { HtmlValidate } from 'html-validate';
import { resourceURL } from "../../../src/security/urls.mjs";
import { escapeHtml } from "../../../src/security/html.mjs";
import { formatBytesToHumanSize } from "../../../src/formatting/units.mjs";
import { renderFilePaths } from "../../../src/features/studies/file-paths.mjs";

const tableSource = await readFile(new URL("../../../src/features/studies/viewable-images.js", import.meta.url), 'utf8');
const tableScript = ts.transpileModule(tableSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function runTable(context) {
    vm.runInNewContext(tableScript, { ...context, exports: {}, require: name => {
            const modules = { '../../security/urls.mjs': { resourceURL }, '../../security/html.mjs': { escapeHtml },
                '../../formatting/units.mjs': { formatBytesToHumanSize }, './file-paths.mjs': { renderFilePaths } };
            assert(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
            return modules[name];
        } });
}
const imageSource = await readFile(new URL("../../../src/features/images/ImageActions.astro", import.meta.url), 'utf8');
const { ast } = await parse(imageSource);
function findScripts(node) {
    return [
        ...(node.type === 'element' && node.name === 'script' ? [node] : []),
        ...(node.children || []).flatMap(findScripts),
    ];
}
const copyScripts = findScripts(ast).map(node => node.children.map(child => child.value || '').join(''))
    .filter(script => script.includes('CopyURLButton'));
assert.equal(copyScripts.length, 1);
const copyScript = ts.transpileModule(copyScripts[0], {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const clipboardSource = await readFile(new URL('../../../src/components/ui/clipboard.mjs', import.meta.url), 'utf8');
const clipboardScript = ts.transpileModule(clipboardSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function runCopy(context) {
    const exports = {};
    vm.runInNewContext(clipboardScript, { ...context, exports, clearTimeout });
    vm.runInNewContext(copyScript, { ...context, exports: {}, require: name => {
        assert.equal(name, '../../components/ui/clipboard.mjs'); return exports;
    } });
}

test('an absent viewable-image table registers no handlers and needs no jQuery', () => {
    const events = [];
    runTable({
        document: {
            querySelector: () => null,
            addEventListener: (...args) => events.push(args),
        },
    });
    assert.deepEqual(events, []);
});

test('a present table retains initialization, image destinations and its API request', async () => {
    const events = new Map();
    const calls = [];
    let options;
    const table = { on: (...args) => calls.push(args) };
    const element = { dataset: {
        studyAccessionId: 'S-BIAD3335', imagePageRoot: 'galleries/spatialomics/image',
        imageFallbackSrc: '/fallback.png', apiPath: '/search/v1',
    } };
    const jquery = () => ({
        DataTable: config => { options = config; return table; },
        on: (...args) => calls.push(args),
    });
    jquery.fn = { DataTable: { isDataTable: () => false } };
    const requests = [];
    const image = { uuid: '001b8ef2-7a5e-4b94-b91c-d93f5095ee39', dataset_title: 'Dataset A' };
    runTable({
        document: {
            querySelector: selector => selector === "#viewable_images_table" ? element : null,
            addEventListener: (name, handler) => events.set(name, handler),
        },
        window: { addEventListener: (name, handler) => events.set(name, handler) },
        history: { state: null }, sessionStorage: { getItem: () => null },
        $: jquery,
        fetch: async url => {
            requests.push(url);
            return { json: async () => ({ hits: { hits: [{ _source: image }], total: { value: 1 } } }) };
        },
    });
    events.get('DOMContentLoaded')();
    assert.equal(options.serverSide, true);
    assert.equal(options.pageLength, 10);
    assert.match(options.columns[5].render(null, null, image), /galleries\/spatialomics\/image\/001b8ef2-7a5e-4b94-b91c-d93f5095ee39/);
    assert.match(options.columns[0].render(null, null, image), /src="\/fallback.png"/);
    assert.match(options.columns[0].render(null, null, image), /aria-label="View image 001b8ef2-7a5e-4b94-b91c-d93f5095ee39"/);
    for (const [value, expected] of [[undefined, 'Unknown'], [null, 'Unknown'], [-1, 'Unknown'], [0, '0.00 B'], [0.5, '0.50 B'], [1e18, '1000.00 PB']]) {
        assert.equal(options.columns[4].render(null, null, { ...image, total_size_in_bytes: value }), expected);
    }
    const validator = new HtmlValidate(JSON.parse(await readFile(new URL('../../../configs/audits/markup/htmlvalidate.json', import.meta.url), 'utf8')));
    const rowImage = { ...image, label: ['one', 'two', 'three'] };
    const row = options.columns.map(column => `<td>${column.render(rowImage[column.data], 'display', rowImage)}</td>`).join('');
    const markup = await validator.validateString(`<table><tbody><tr>${row}</tr></tbody></table>`);
    assert(markup.valid, JSON.stringify(markup.results));
    let result;
    await options.ajax({ start: 0, length: 10, search: { value: 'brain tissue' }, draw: 7 }, value => { result = value; });
    assert.equal(requests[0], '/search/v1/website/browse/image?facet.accession_id=S-BIAD3335&query=brain%20tissue&pagination.page_size=10&pagination.page=1');
    assert.equal(result.draw, 7);
    assert.equal(result.recordsTotal, 1);
    assert.equal(result.data[0], image);
    assert(events.has('pagehide'));
    assert(calls.length > 0);
});

test('an image without an OME-Zarr copy button needs no clipboard API', () => {
    runCopy({ document: { getElementById: () => null } });
});

test('an image copy button copies its supplied URI and restores its label', async () => {
    const button = { textContent: 'Copy OME-Zarr URI', disabled: false, dataset: { url: 'https://example.org/image.ome.zarr' } };
    const copied = [];
    const timers = [];
    runCopy({
        document: { getElementById: () => button },
        navigator: { clipboard: { writeText: async text => copied.push(text) } },
        setTimeout: (callback, duration) => timers.push({ callback, duration }),
    });
    await button.onclick();
    assert.deepEqual(copied, [button.dataset.url]);
    assert.equal(button.textContent, 'URI Copied');
    assert.equal(timers[0].duration, 700);
    timers[0].callback();
    assert.equal(button.textContent, 'Copy OME-Zarr URI');
});

test('the shared browser loader establishes blocking local jQuery before DataTables', async () => {
    const source = await readFile(new URL("../../../src/layouts/document/BrowserDependencies.astro", import.meta.url), 'utf8');
    const { ast } = await parse(source);
    const scripts = findScripts(ast);
    assert.deepEqual(scripts.map(node => node.attributes.find(attribute => attribute.name === 'data-bia-dependency')?.value), ['jquery', 'datatables']);
    for (const script of scripts) {
        assert(script.attributes.some(attribute => attribute.name === 'is:inline'));
        assert(!script.attributes.some(attribute => ['async', 'defer', 'type'].includes(attribute.name)));
    }
});
