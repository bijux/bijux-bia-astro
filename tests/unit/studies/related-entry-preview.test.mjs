import assert from 'node:assert/strict';
import test from 'node:test';
import { renderRelatedEntries } from '../../../src/features/studies/related-entry-preview.mjs';

test('EMDB resolution units remain readable and are escaped once at the HTML boundary', () => {
    for (const [units, label] of [[undefined, 'Å'], ['', 'Å'], ['Å', 'Å'], ['Å', 'Å'],
        ['nm & pixels', 'nm &amp; pixels'], ['<unit>', '&lt;unit&gt;']]) {
        const entries = [{ accession: '1234', href: 'https://www.ebi.ac.uk/emdb/EMD-1234',
            metadata: { structure_determination_list: { structure_determination: {
                image_processing: { final_reconstruction: { resolution: { valueOf_: '3.25', units } } },
            } } } }];
        const before = structuredClone(entries);
        const [pdb, emdb] = renderRelatedEntries([], entries);
        assert.equal(pdb, null);
        assert(emdb.includes(`Resolution: 3.25 ${label}</span>`), emdb);
        assert(emdb.includes(`(3.25 ${label})`), emdb);
        assert(emdb.includes('href="https://www.ebi.ac.uk/emdb/EMD-1234"'));
        assert.deepEqual(entries, before);
    }
});

test('related entries retain destinations and previews when optional EMDB enrichment is missing', () => {
    const [pdb, emdb] = renderRelatedEntries([{ accession: '1abc', href: 'https://www.ebi.ac.uk/pdbe/entry/pdb/1abc' }],
        [{ accession: '12345', href: 'https://www.ebi.ac.uk/emdb/EMD-12345', metadata: null }]);
    assert(pdb.includes('href="https://www.ebi.ac.uk/pdbe/entry/pdb/1abc"'));
    assert(pdb.includes('1abc_deposited_chain_front_image-200x200.png'));
    assert(emdb.includes('/12/3/12345/images/400_12345.gif'));
    assert(!emdb.includes('Resolution:'));
    assert.deepEqual(renderRelatedEntries([], []), [null, null]);
});
