import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadStudyPage, loadStudyFiles } from '../../../src/features/studies/load-study.mjs';

const study = JSON.parse(await readFile(new URL('../../fixtures/api/study-s-biad3335-response.json', import.meta.url))).hits.hits[0]._source;

test('study preparation preserves records, order and file controls without mutation', async () => {
    const original = structuredClone(study);
    const info = { httpLink: 'https://example.org/files', globusLink: 'https://example.org/globus' };
    const calls = [];
    const request = async url => { calls.push(url); return info; };
    const view = await loadStudyPage(study.accession_id, { getStudyFromApiByAccession: async () => study, getFromAPI: request, studyHasSpecimenTracks: async () => true }, async (value, transport) => {
        assert.equal(value, study); assert.equal(transport, request); return { pdb: [], emdb: [] };
    });
    assert.equal(view.hasSpecimenTracks, study.image.length > 0);
    assert.equal(view.study, study); assert.equal(view.images, study.image);
    assert.equal(view.tableOfContents['Datasets'], 'study_components');
    assert.equal(view.ftpHttpsLink, info.httpLink); assert.equal(view.globusLink, info.globusLink);
    assert.equal(view.hasFileList, Boolean(view.fileListUrls?.table_view && view.fileListUrls?.tree_view));
    assert.equal(view.browseFilesLink, view.hasFileList ? '#file_list' : info.httpLink);
    assert.equal(view.headlineStats['Total files'], 621);
    assert.equal(calls.length, 1);
    assert.deepEqual(study, original);
});

test('required study/file failures propagate while EMPIAR links need no file-service request', async () => {
    const unused = async () => { throw new Error('File service must not be called'); };
    const links = await loadStudyFiles('EMPIAR-12104', unused);
    assert.equal(links.ftpHttpsLink, 'https://ftp.ebi.ac.uk/empiar/world_availability/12104');
    assert.equal(new URL(links.globusLink).searchParams.get('origin_path'), '/empiar/world_availability/12104/');
    await assert.rejects(loadStudyPage('missing', { getStudyFromApiByAccession: async () => undefined }), /unavailable/);
    for (const value of [null, [], { httpLink: {} }]) await assert.rejects(loadStudyFiles('S-BIAD1', async () => value), /Invalid file links/);
    const failure = new Error('Controlled file-service failure');
    await assert.rejects(loadStudyFiles('S-BIAD1', async () => { throw failure; }), error => error === failure);
});


test('legacy study navigation excludes absent datasets without changing metadata or file access', async () => {
    const legacy = JSON.parse(await readFile(new URL('../../fixtures/api/study-s-biad546-response.json', import.meta.url))).hits.hits[0]._source;
    const before = structuredClone(legacy);
    const info = JSON.parse(await readFile(new URL('../../fixtures/api/file-links-s-biad546-response.json', import.meta.url)));
    const view = await loadStudyPage(legacy.accession_id, {
        getStudyFromApiByAccession: async () => legacy,
        getFromAPI: async url => { assert.equal(url, 'https://www.ebi.ac.uk/biostudies/api/v1/studies/S-BIAD546/info'); return info; },
        studyHasSpecimenTracks: () => assert.fail('A study without images needs no specimen-track request'),
    }, async () => ({ pdb: [], emdb: [] }));
    assert.equal(view.study, legacy);
    assert(!Object.hasOwn(view.tableOfContents, 'Datasets'));
    assert.equal(view.tableOfContents['Study Information'], 'study');
    assert.equal(view.tableOfContents['Viewable Images'], 'viewable_images');
    assert.equal(view.browseFilesLink, '#file_list');
    assert.equal(view.hasFileList, true);
    assert.equal(view.ftpHttpsLink, info.httpLink);
    assert.equal(view.fileListUrls.table_view, legacy.additional_metadata.find(entry => entry.name === 'file_list_visualisation').value.table_view);
    assert.deepEqual(legacy, before);
});
