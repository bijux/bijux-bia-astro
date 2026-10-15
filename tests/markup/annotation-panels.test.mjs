import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { resourceURL } from '../../src/security/urls.mjs';
import { imageSizeMicrometres } from '../../src/features/galleries/ai/image-dimensions.mjs';

const source = await readFile(new URL('../../src/features/galleries/ai/SourceAnnotatedImage.astro', import.meta.url), 'utf8');
const body = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const script = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function runViewer({ missingProtocol = false, protocolDescription = '', slides = 2, missingRepresentation = false } = {}) {
    const annotations = ['dataset-a', 'dataset-b'].map((dataset, index) => ({
        uuid: `image-${index}`, submission_dataset_uuid: dataset,
        representation: missingRepresentation ? [] : [{ image_format: '.ome.zarr', size_x: 100 + index, size_y: 200,
            size_c: 1, size_t: 1, voxel_physical_size_x: 1e-6, voxel_physical_size_y: 1e-6,
            file_uri: [`https://example.org/${dataset}.ome.zarr`] }],
        additional_metadata: [{ name: 'attributes_from_file_reference', value: { attributes: { 'N<C': '<img src=x> & literal' } } }],
    }));
    const panels = ['dataset-a', 'dataset-b'].map(dataset => {
        const fields = { '[data-annotation-type]': { innerText: 'authored type' }, '[data-annotation-method]': { innerText: 'authored method' } };
        return { dataset: { annotationDataset: dataset }, fields, querySelector: selector => fields[selector] };
    });
    const nodes = new Map();
    for (const id of ['annotated-size', 'annotated-pixels', 'annotated-channels', 'annotated-timesteps', 'AnnotatedImageLength', 'OpenAnnotationInVizarr', 'OpenAnnotationInITK']) nodes.set(id, { innerText: 'untouched' });
    nodes.set('CopyAnnotationButton', { dataset: {} });
    nodes.set('slider', { children: annotations.slice(0, slides).map(image => ({ id: image.uuid })), style: {} });
    const metadata = { children: [], innerHTML: '', replaceChildren(...nodes) { this.children = nodes; }, appendChild(node) { this.children.push(node); } };
    nodes.set('annotated-metadata', metadata);
    for (const [id, data] of Object.entries({ 'images-length': annotations.length, 'images-json': annotations, 'study-json': panels.map(panel => ({ uuid: panel.dataset.annotationDataset, annotation_process: missingProtocol ? [] : [{ title: panel.dataset.annotationDataset, protocol_description: protocolDescription, annotation_criteria: 'criteria-' + panel.dataset.annotationDataset }] })) })) {
        nodes.set(id, { textContent: JSON.stringify(data) });
    }
    class Anchor { removeAttribute(name) { delete this[name]; } }
    for (const id of ['OpenAnnotationInVizarr','OpenAnnotationInITK']) nodes.set(id,new Anchor());
    const window = {};
    vm.runInNewContext(script, { window, URL, HTMLAnchorElement: Anchor, exports: {}, require: name => { if (name === './image-dimensions.mjs') return { imageSizeMicrometres }; assert.equal(name, '../../../security/urls.mjs'); return { resourceURL }; }, document: {
        getElementById: id => nodes.get(id),
        querySelectorAll: selector => { if (selector === '.imageslider') return []; assert.equal(selector, '[data-annotation-dataset]'); return panels; },
        createElement: tag => ({ tag, children: [], textContent: '', append(...children) { this.children.push(...children); } }),
        createTextNode: text => ({ textContent: text }),
    } });
    return { window, nodes, panels, metadata };
}

test('the real annotation script targets the selected dataset and preserves other panels', () => {
    const { window, panels, nodes } = runViewer();
    assert.equal(panels[0].fields['[data-annotation-type]'].innerText, 'dataset-a');
    assert.equal(panels[1].fields['[data-annotation-type]'].innerText, 'authored type');
    window.slide(1);
    assert.equal(panels[1].fields['[data-annotation-type]'].innerText, 'dataset-b');
    assert.equal(panels[1].fields['[data-annotation-method]'].innerText, 'criteria-dataset-b');
    assert.equal(panels[0].fields['[data-annotation-type]'].innerText, 'dataset-a');
    assert.equal(nodes.get('annotated-pixels').innerText, '101 x 200 pixels');
    assert.equal(nodes.get('annotated-size').innerText, '1.0e+2μm x 2.0e+2μm');
    assert.equal(nodes.get('CopyAnnotationButton').dataset.url, 'https://example.org/dataset-b.ome.zarr');
    assert.equal(new URL(nodes.get('OpenAnnotationInVizarr').href).searchParams.get('source'), 'https://example.org/dataset-b.ome.zarr');
    window.slide(1);
    assert.equal(nodes.get('annotated-pixels').innerText, '100 x 200 pixels');
});

test('annotation protocols take precedence over criteria and remain literal text', () => {
    const { panels, window } = runViewer({ protocolDescription: '<b>Supplied protocol</b>' });
    window.slide(1);
    for (const panel of panels) assert.equal(panel.fields['[data-annotation-method]'].innerText, '<b>Supplied protocol</b>');
});

test('zero rendered slides are safe even when annotation records were supplied', () => {
    const { window } = runViewer({ slides: 0 });
    assert.equal(window.slide, undefined);
});

test('annotations without viewer representations retain navigable metadata without NaN', () => {
    const { window, panels, nodes } = runViewer({ missingRepresentation: true });
    window.slide(1);
    assert.equal(panels[1].fields['[data-annotation-type]'].innerText, 'dataset-b');
    assert.equal(nodes.get('CopyAnnotationButton').dataset.url, '');
    for (const id of ['annotated-size', 'annotated-pixels', 'annotated-channels', 'annotated-timesteps']) assert.doesNotMatch(nodes.get(id).innerText, /NaN|undefined/);
});

test('missing annotation protocols retain the empty fallback without a lookup error', () => {
    const { panels, window } = runViewer({ missingProtocol: true });
    window.slide(1);
    for (const panel of panels) {
        assert.equal(panel.fields['[data-annotation-type]'].innerText, '');
        assert.equal(panel.fields['[data-annotation-method]'].innerText, '');
    }
});
