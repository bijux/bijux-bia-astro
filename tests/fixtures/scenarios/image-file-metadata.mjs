import { readFileSync } from 'node:fs';

const captured = JSON.parse(readFileSync(new URL('../api/image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json', import.meta.url))).hits.hits[0]._source;

export const imageWithFileMetadata = structuredClone(captured);
imageWithFileMetadata.uuid = '00000000-0000-4000-8000-000000000102';
imageWithFileMetadata.additional_metadata = [];
imageWithFileMetadata.upstream_image_uuids = [];
imageWithFileMetadata.segmentation_image_uuids = [];
imageWithFileMetadata.specimen_track_position = 'terminal';
imageWithFileMetadata.creation_process = { ...imageWithFileMetadata.creation_process, input_image_uuid: [] };
imageWithFileMetadata.representation = [{ uuid: '00000000-0000-4000-8000-000000000022', image_format: '.ome.zarr',
    file_uri: ['https://example.org/metadata.ome.zarr'], size_x: 222, size_y: 100 }];
imageWithFileMetadata.file_path = ['sample/a.tif', 'sample/b.tif', 'sample/c.tif', 'sample/d.tif'];
imageWithFileMetadata.file_list_attributes = [{ value: { attributes: Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [`Measurement ${index + 1}`, `Supplied value ${index + 1}`]),
) } }];

export const imageWithoutViewer = structuredClone(imageWithFileMetadata);
imageWithoutViewer.uuid = '00000000-0000-4000-8000-000000000103';
imageWithoutViewer.representation = [{ image_format: '.tif', file_uri: ['https://example.org/sample.tif'] }];
