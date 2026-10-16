import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlValidate } from 'html-validate';
import { parseFragment } from 'parse5';
import { renderFilePaths } from '../../../src/features/studies/file-paths.mjs';

const validator = new HtmlValidate({ extends: ['html-validate:recommended'] });
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

test('file cells retain label precedence, order and empty-path behaviour without mutating records', () => {
    for (const [image, expected] of [[{}, []], [{ label: [], file_path: ['fallback'] }, []],
        [{ label: '', file_path: ['a', null, 'b'] }, ['a,', 'b']],
        [{ label: 'label', file_path: 'path' }, ['label']]]) {
        const before = structuredClone(image);
        const html = renderFilePaths(image);
        const lines = parseFragment(html).childNodes[0]?.childNodes ?? [];
        assert.deepEqual(lines.map(text), expected);
        assert.deepEqual(image, before);
    }
});

test('long, Unicode and markup-like paths form valid escaped disclosure markup with every supplied path', async () => {
    const paths = ['a'.repeat(39) + '🧬' + 'b', '<img src=x onerror=alert(1)> & "sample"', "third's path", 'fourth'];
    const html = renderFilePaths({ file_path: paths });
    const result = await validator.validateString(html);
    assert(result.valid, JSON.stringify(result.results));
    const cell = parseFragment(html).childNodes[0];
    const visible = cell.childNodes.filter(node => node.nodeName === 'div' && !node.attrs.length);
    const extra = cell.childNodes.find(node => node.attrs?.some(attr => attr.name === 'hidden'));
    assert.deepEqual(visible.map(text), paths.slice(0, 2).map(path => path + ','));
    assert.deepEqual(extra.childNodes.map(text), [paths[2] + ',', paths[3]]);
    assert(html.includes('🧬<wbr>b'), 'Breaks must not split a Unicode code point.');
    assert(!html.includes('<img'));
    assert(html.includes('aria-expanded="false"'));
    assert(!renderFilePaths({ file_path: paths.slice(0, 2) }).includes('<button'));
});
