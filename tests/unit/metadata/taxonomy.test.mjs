import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTaxonNames, renderTaxonList, renderTaxonName } from '../../../src/features/metadata/taxonomy.mjs';

test('distinct classifications survive missing or shared names; only complete duplicates collapse', () => {
    const taxa = Object.freeze([
        Object.freeze({ scientific_name: 'Mus musculus' }),
        Object.freeze({ scientific_name: 'Homo sapiens' }),
        Object.freeze({ common_name: 'Mouse' }),
        Object.freeze({ common_name: 'Human' }),
        Object.freeze({ scientific_name: 'Species one', common_name: 'Shared name', ncbi_id: '1' }),
        Object.freeze({ scientific_name: 'Species two', common_name: 'Shared name', ncbi_id: '2' }),
        Object.freeze({ scientific_name: 'Species one', common_name: 'Shared name', ncbi_id: '3' }),
    ]);
    const study = Object.freeze({ organism_classification: Object.freeze([...taxa, { ...taxa[0] }]) });
    assert.deepEqual(renderTaxonNames(study), [
        '<i>Mus musculus</i>', '<i>Homo sapiens</i>', 'Mouse', 'Human',
        '<i>Species one</i> (Shared name)', '<i>Species two</i> (Shared name)',
        '<i>Species one</i> (Shared name)',
    ]);
    assert.equal(study.organism_classification.length, 8);
});

test('taxon summaries omit malformed records and escape supplied labels', () => {
    for (const organism_classification of [undefined, null, {}, 'Mouse']) {
        assert.deepEqual(renderTaxonNames({ organism_classification }), []);
    }
    assert.equal(renderTaxonName(null), '');
    const study = { organism_classification: [null, false, [], {},
        { scientific_name: '<Mouse>', common_name: 'A & B' },
        { common_name: '<Human>' }] };
    assert.equal(renderTaxonList(study), '<i>&lt;Mouse&gt;</i> (A &amp; B), &lt;Human&gt;');
});
