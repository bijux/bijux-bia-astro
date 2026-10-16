import assert from 'node:assert/strict';
import test from 'node:test';
import { generateHowToCiteText } from '../../../src/features/studies/citation.mjs';

test('a study citation retains the dataset identity and DOI independently of related papers', () => {
    const study = { accession_id: 'S-BIAD3335', release_date: '2026-01-20', title: 'Dataset & images',
        doi: 'https://doi.org/10.1234/dataset', author: [{ display_name: 'Researcher <One>' }],
        related_publication: [{ doi: 'https://doi.org/10.1234/paper' }] };
    const before = structuredClone(study);
    const html = generateHowToCiteText(study);
    assert(html.includes('Researcher &lt;One&gt; (2026) Dataset &amp; images.'));
    assert(html.includes('BioImage Archive, S-BIAD3335.'));
    assert(html.includes('href="https://doi.org/10.1234/dataset"'));
    assert(!html.includes('10.1234/paper'));
    assert.deepEqual(study, before);
});

test('missing or unsafe study DOIs fall back to the correct archive without borrowing a publication DOI', () => {
    for (const [accession_id, archive] of [['S-BIAD3335', 'biostudies/BioImages/studies'], ['EMPIAR-12104', 'empiar']]) {
        for (const doi of [null, '', 'javascript:alert(1)']) {
            const html = generateHowToCiteText({ accession_id, title: 'Study', release_date: '2026-01-20', doi,
                related_publication: [{ doi: 'https://doi.org/10.1234/paper' }] });
            assert(html.includes(`href="https://www.ebi.ac.uk/${archive}/${accession_id}"`));
            assert(!/javascript:|10\.1234\/paper|undefined|null/.test(html));
        }
    }
});
