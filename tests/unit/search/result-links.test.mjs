import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightLinks, additionalHighlightFields } from '../../../src/features/search/results/highlights.mjs';

const base = '/bioimage-archive/study/S-BIAD3335';

test('missing, empty or malformed highlights retain the result destination', () => {
    for (const highlights of [undefined, null, {}, { title: [] }, { title: [null, 3, {}] }]) {
        assert.equal(highlightLinks(base, highlights, 'cell'), base);
    }
    assert.equal(highlightLinks(base, { title: ['cell'] }, ''), base);
});

test('the first matching snippet becomes an encoded text fragment without changing the source', () => {
    const snippets = Object.freeze(['Unrelated title', '__HIT__Cell__/HIT__ & nucleus #1', 'Later cell']);
    const highlights = Object.freeze({ title: snippets });
    assert.equal(highlightLinks(base, highlights, 'CELL'), `${base}#:~:text=Cell%20%26%20nucleus%20%231`);
    assert.deepEqual(snippets, ['Unrelated title', '__HIT__Cell__/HIT__ & nucleus #1', 'Later cell']);
});

test('snippet limits bound fragment selection while retaining a usable fallback', () => {
    const highlights = { title: ['Unrelated title', '__HIT__cell__/HIT__'] };
    assert.equal(highlightLinks(base, highlights, 'cell', 1), base);
    assert.equal(highlightLinks(base, highlights, 'cell', 0), base);
    assert.equal(highlightLinks(base, highlights, 'cell', 2), `${base}#:~:text=cell`);
});


test('additional match fields preserve supplied order and values without rendering empty or malformed snippets', () => {
    const highlights = Object.freeze({ title: Object.freeze(['Primary title']),
        'author.name': Object.freeze(['', null, '__HIT__Cell__/HIT__ & nucleus <script>']),
        zero: 0, flag: false, empty: Object.freeze([]), whitespace: '  ', absent: null, malformed: Object.freeze({}) });
    assert.deepEqual(additionalHighlightFields(highlights), [
        ['author.name', '__HIT__Cell__/HIT__ & nucleus <script>'], ['zero', '0'], ['flag', 'false'],
    ]);
    for (const value of [undefined, null, [], { title: ['Only a title'], description: [] }])
        assert.deepEqual(additionalHighlightFields(value), []);
});
