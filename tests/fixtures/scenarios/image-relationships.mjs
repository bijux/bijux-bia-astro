import { imageWithoutViewer } from './image-file-metadata.mjs';

const record = (suffix, label, position, ancestors, bytes) => ({
    ...structuredClone(imageWithoutViewer), uuid: `00000000-0000-4000-8000-${suffix}`,
    label, specimen_track_position: position, upstream_image_uuids: ancestors,
    total_size_in_bytes: bytes, file_path: [], file_list_attributes: [],
});

export const rootImage = record('000000000105', 'Root <sample>', 'internal', [], null);
export const intermediateImage = record('000000000106', 'Intermediate & assay', 'internal', [rootImage.uuid], 0);
export const unknownPositionImage = record('000000000108', 'Unclassified image', 'constructor', [intermediateImage.uuid], 1);
export const relationshipImage = record('000000000104', 'Derived image', 'terminal',
    [rootImage.uuid, unknownPositionImage.uuid, intermediateImage.uuid], 100);
export const segmentationImage = record('000000000107', null, 'segmentation', [relationshipImage.uuid], 10);
relationshipImage.creation_process.input_image_uuid = [intermediateImage.uuid, rootImage.uuid];
relationshipImage.segmentation_image_uuids = [segmentationImage.uuid];
segmentationImage.creation_process.input_image_uuid = [relationshipImage.uuid];
export const relationshipImages = [relationshipImage, rootImage, intermediateImage, unknownPositionImage, segmentationImage];
