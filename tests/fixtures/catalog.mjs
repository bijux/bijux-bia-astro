import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
export const fixtureVersion = 'synthetic-consumer-contracts-1';
export const primaryAccessions = ['S-BIAD90001', 'S-BIAD90002'];
const collections = ['src/data/collections/ai-ready-datasets.json', 'src/data/collections/spatialomics.json'];
export const knownAccessions = new Set(primaryAccessions);
for (const file of collections) {
  for (const id of JSON.parse(readFileSync(resolve(root, file))).accession_ids) knownAccessions.add(id);
}
for (const id of Object.keys(JSON.parse(readFileSync(resolve(root, 'src/data/ai-dataset-benchmarking/additional-study-metadata.json'))))) knownAccessions.add(id);

export function imageUUID(accession) {
  const hash = createHash('sha256').update(`synthetic-image:${accession}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function syntheticStudy(accession, origin) {
  const uuid = imageUUID(accession);
  const dataset = {
    uuid: `synthetic-dataset-${accession}`, title: 'Synthetic acquisition dataset',
    image_count: 1, file_reference_count: 2, file_reference_size_bytes: 2048,
    acquisition_process: [{ title: 'Synthetic acquisition', imaging_method_name: ['Synthetic microscopy'] }],
    annotation_process: [], additional_metadata: [],
  };
  return {
    accession_id: accession, uuid: `synthetic-study-${accession}`,
    title: `Synthetic fixture study ${accession}`, description: 'Synthetic test data; no scientific observation is asserted.',
    release_date: '2026-01-02', last_modified_date: '2026-01-03',
    author: [{ display_name: 'Synthetic Fixture Author', affiliation: [] }],
    licence_details: { uri: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'Synthetic fixture only', logo_uri: `${origin}/fixture-thumbnail.svg` },
    keyword: ['synthetic', 'microscopy'], imaging_method: ['Synthetic microscopy'], organism_classification: [],
    example_image_uri: [`${origin}/fixture-thumbnail.svg`],
    dataset: [dataset], image: [syntheticImage(accession, origin)],
    see_also: [], related_publication: [], grant: [], annotation_type: [],
    additional_metadata: [{ name: 'ai_tags', value: { ai_tags: [['synthetic']] } }],
  };
}

export function syntheticImage(accession, origin) {
  const uuid = imageUUID(accession);
  return {
    uuid, accession_id: accession, submission_dataset_uuid: `synthetic-dataset-${accession}`,
    dataset_title: 'Synthetic acquisition dataset', study_title: `Synthetic fixture study ${accession}`,
    study_release_date: '2026-01-02', title: 'Synthetic fixture image',
    imaging_method: ['Synthetic microscopy'], organism_classification: [], annotation_type: [],
    representation: [{ uuid: `${uuid}-representation`, image_format: '.ome.zarr', file_uri: [`${origin}/synthetic.ome.zarr`], size_x: 2, size_y: 2, size_z: 1, size_c: 1, size_t: 1, voxel_physical_size_x: 0.000001, voxel_physical_size_y: 0.000001, voxel_physical_size_z: null }],
    creation_process: { input_image_uuid: [], acquisition_process: [], annotation_method: [], protocol: [] },
    specimen_track_position: 'terminal', upstream_image_uuids: [], segmentation_image_uuids: [],
    file_path: ['synthetic slice & µ.tiff'], total_size_in_bytes: 2048,
    total_physical_size_x: 0.000002, total_physical_size_y: 0.000002, total_physical_size_z: null,
    licence_details: { uri: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'Synthetic fixture only', logo_uri: `${origin}/fixture-thumbnail.svg` },
    file_list_attributes: [],
    additional_metadata: [
      { name: 'image_static_display_uri', value: { slice: { uri: `${origin}/fixture-thumbnail.svg` } } },
      { name: 'image_thumbnail_uri', value: { 256: { uri: `${origin}/fixture-thumbnail.svg` } } },
    ],
  };
}

export function searchResponse(records, page = 1, pageSize = 100) {
  const total = records.length;
  return {
    hits: { total: { value: total, relation: 'eq' }, max_score: null, hits: records.slice((page - 1) * pageSize, page * pageSize).map(record => ({ _id: record.uuid, _source: record })) },
    pagination: { page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)), next_cursor: null },
    facets: {},
  };
}
