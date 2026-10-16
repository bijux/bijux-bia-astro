const labels = new Map([
    ['internal', 'Internal'], ['terminal', 'Terminal'], ['segmentation', 'Segmentation'],
]);

/** Only an explicitly empty ancestor list establishes a root image. */
export const isRootImage = image => image.upstream_image_uuids?.length === 0;

export function imagePositionLabel(image) {
    return isRootImage(image) ? 'Root' : labels.get(image.specimen_track_position) ?? image.specimen_track_position;
}
