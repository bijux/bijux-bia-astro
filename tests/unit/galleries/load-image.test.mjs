import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGalleryImage } from '../../../src/features/galleries/load-image.mjs';

test('gallery loading preserves primary data and distinguishes absent images from broken study references', async () => {
    const image = Object.freeze({ uuid: 'image', accession_id: 'study' }), study = Object.freeze({ accession_id: 'study' });
    const calls = [];
    const client = { getImageFromAPI: async uuid => { calls.push(uuid); return image; }, getStudyFromApiByAccession: async accession => { calls.push(accession); return study; } };
    const data = await loadGalleryImage('image', client);
    assert.equal(data.image, image); assert.equal(data.study, study); assert.deepEqual(calls, ['image', 'study']);
    assert.equal(await loadGalleryImage('absent', { getImageFromAPI: async () => null }), null);
    await assert.rejects(loadGalleryImage('image', { ...client, getStudyFromApiByAccession: async () => undefined }), /unavailable study/);
    await assert.rejects(loadGalleryImage('image', { ...client, getImageFromAPI: async () => ({ uuid: 'image' }) }), /study accession/);
});
