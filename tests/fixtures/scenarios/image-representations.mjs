import { readFileSync } from 'node:fs';

const captured = JSON.parse(readFileSync(new URL('../api/image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json', import.meta.url))).hits.hits[0]._source;

// Missing optional representation UUIDs must not act as a recommendation.
export const uncuratedImage = structuredClone(captured);
uncuratedImage.uuid = '00000000-0000-4000-8000-000000000099';
uncuratedImage.additional_metadata = [];
uncuratedImage.upstream_image_uuids = [];
uncuratedImage.segmentation_image_uuids = [];
uncuratedImage.specimen_track_position = 'terminal';
uncuratedImage.creation_process = { ...uncuratedImage.creation_process, input_image_uuid: [] };
uncuratedImage.representation = [
    { image_format: '.tif', file_uri: ['https://example.org/preview.tif'], size_x: 111, size_y: 100 },
    { uuid: '00000000-0000-4000-8000-000000000011', image_format: '.ome.zarr',
        file_uri: ['https://example.org/fallback.ome.zarr'], size_x: 222, size_y: 100 },
];
