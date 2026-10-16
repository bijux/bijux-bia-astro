import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../../../../src/features/galleries/volume-em/gallery-controls.js', import.meta.url), 'utf8');

function loadGallery({ hasRoot = true } = {}) {
    const events = new Map();
    const views = new Map(['card-view', 'table-view', 'grid-view'].map(id => [id, { style: {} }]));
    const search = { value: '', addEventListener: (name, handler) => events.set(`search:${name}`, handler) };
    const counts = { totalCount: {}, visibleCount: {} };
    const radioHandlers = [];
    const densityHandlers = [];
    const radios = ['card-view', 'table-view', 'grid-view'].map(value => ({
        value, checked: value === 'card-view', disabled: true,
        addEventListener: (name, handler) => { assert.equal(name, 'change'); radioHandlers.push(handler); },
    }));
    const densities = [3, 4, 5].map(value => ({ value: String(value), checked: value === 4, disabled: true,
        addEventListener: (name, handler) => { assert.equal(name, 'change'); densityHandlers.push(handler); },
    }));
    const tableElement = {};
    const grid = { style: {} };
    const sizeBar = { style: {} };
    const cube = { style: {} };
    let adjustments = 0;
    const tableCalls = [];
    const root = {
        querySelector: selector => selector === '.grid-inner' ? grid : selector === '#searchBox' ? search :
            selector === '#table-view table' ? tableElement : views.get(selector.slice(1)) || counts[selector.slice(1)],
        querySelectorAll: selector => ({
            'input[name="view"]': radios, 'input[name="columns"]': densities,
            '.size-bar, .cube-wrapper': [sizeBar, cube],
        })[selector] || [],
    };
    const document = {
        addEventListener: (name, handler) => events.set(name, handler),
        querySelector: selector => { assert.equal(selector, '[data-volume-gallery]'); return hasRoot ? root : null; },
    };
    const sandbox = {
        document, URL, console,
        DataTable: class {
            constructor(selector, options) {
                tableCalls.push({ selector, options });
                this.columns = { adjust: () => { adjustments++; } };
                this.search = { fixed() {} };
                this.draw = () => {};
            }
        },
    };
    sandbox.window = sandbox;
    vm.runInNewContext(script, sandbox, { filename: 'gallery-controls.js' });
    return { events, views, radios, radioHandlers, densities, densityHandlers, tableElement, grid, sizeBar, cube, tableCalls, sandbox,
        adjustments: () => adjustments };
}

test('switching to the table uses the initialized table instance', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    assert.equal(gallery.tableCalls.length, 1);
    assert.equal(gallery.tableCalls[0].selector, gallery.tableElement);
    assert.equal(gallery.tableCalls[0].options.pageLength, 25);
    gallery.radios[1].checked = true;
    gallery.radioHandlers[1]();
    assert.equal(gallery.adjustments(), 1);
    assert.equal(gallery.views.get('table-view').style.display, 'block');
    assert.equal(gallery.views.get('card-view').style.display, 'none');
    assert.equal(gallery.views.get('grid-view').style.display, 'none');
});

test('grid and card switches do not adjust table columns', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    for (const value of ['grid-view', 'card-view']) {
        gallery.radios[0].value = value;
        gallery.radioHandlers[0]();
        assert.equal(gallery.views.get(value).style.display, 'block');
    }
    gallery.radios[0].checked = false;
    gallery.radioHandlers[0]();
    assert.equal(gallery.adjustments(), 0);
});

test('changing grid density preserves the size-bar and cube visibility contract', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    assert.equal(gallery.grid.style.gridTemplateColumns, 'repeat(4, 1fr)');
    gallery.densities[2].checked = true;
    gallery.densityHandlers[2]();
    assert.equal(gallery.sizeBar.style.display, 'none');
    assert.equal(gallery.cube.style.display, 'none');
    gallery.densities[0].checked = true;
    gallery.densityHandlers[0]();
    assert.equal(gallery.sizeBar.style.display, '');
    assert.equal(gallery.cube.style.display, '');
});

test('a document without the gallery cannot initialize a table or install global grid controls', () => {
    const gallery = loadGallery({ hasRoot: false });
    gallery.events.get('DOMContentLoaded')();
    assert.equal(gallery.tableCalls.length, 0);
    assert.equal(gallery.sandbox.setGridColumns, undefined);
});
