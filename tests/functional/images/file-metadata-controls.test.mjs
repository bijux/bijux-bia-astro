import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../../../src/features/images/file-metadata-controls.js', import.meta.url), 'utf8');

function button(hidden = false) {
    const attributes = { 'aria-expanded': 'false' };
    return { hidden, textContent: 'See more', removed: false,
        remove() { this.removed = true; },
        getAttribute: name => attributes[name],
        setAttribute: (name, value) => { attributes[name] = value; },
    };
}

function run(elements, readyState = 'complete') {
    const events = new Map();
    vm.runInNewContext(script, { document: {
        readyState, getElementById: id => elements[id] ?? null,
        addEventListener: (name, handler) => events.set(name, handler),
    } });
    return events;
}

test('long metadata becomes operable and repeated lifecycle events preserve an expanded block', () => {
    const toggle = button(true);
    const content = { scrollHeight: 1000, style: {} };
    const wrap = { dataset: { collapsed: 'false' } };
    const events = run({ 'meta-wrap': wrap, 'meta-content': content, 'meta-toggle': toggle }, 'loading');
    assert.equal(toggle.hidden, true);
    events.get('DOMContentLoaded')();
    assert.equal(toggle.hidden, false);
    assert.equal(content.style.maxHeight, '250px');
    assert.equal(wrap.dataset.collapsed, 'true');
    toggle.onclick();
    events.get('astro:page-load')();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.textContent, 'See less');
    assert.equal(content.style.maxHeight, '');
    assert.equal(wrap.dataset.collapsed, 'false');
    toggle.onclick();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.textContent, 'See more');
    assert.equal(content.style.maxHeight, '250px');
});

test('short metadata remains untruncated and file paths operate without metadata', () => {
    const toggle = button(true);
    const content = { scrollHeight: 250, style: {} };
    run({ 'meta-wrap': { dataset: {} }, 'meta-content': content, 'meta-toggle': toggle });
    assert.equal(toggle.removed, true);
    assert.deepEqual(content.style, {});

    const pathToggle = button(), extra = { hidden: true };
    const events = run({ 'file-path-toggle': pathToggle, 'file-path-extra': extra });
    pathToggle.onclick();
    events.get('astro:page-load')();
    assert.equal(extra.hidden, false);
    assert.equal(pathToggle.getAttribute('aria-expanded'), 'true');
    pathToggle.onclick();
    assert.equal(extra.hidden, true);
    assert.equal(pathToggle.getAttribute('aria-expanded'), 'false');
    assert.doesNotThrow(() => run({}));
});
