function isImageAnAnnotation(image) {
    return Boolean(image.creation_process?.input_image_uuid?.length && image.representation.some(item => item.image_format === '.ome.zarr') && !image.additional_metadata?.some(metadata => [
        'Raw image in JPEG format', 'Visualization of groundtruth masks in PNG format', 'Visualization of groundtruth for randomly selected nuclei in PNG format',
    ].includes(metadata.value?.attributes?.['file description'])));
}

export function selectAnnotationImages(images, sourceUUID) {
    return images.filter(image => image.uuid !== sourceUUID && isImageAnAnnotation(image));
}

/** Retain curated source exclusions, input order and original image objects. */
export function groupSourceAnnotations(images) {
    const excluded = new Set(['2a382f3a-aa6d-4ace-99fb-468335fa3809', '8921dcfb-4f5b-4ac1-a390-04b3ef2155ea', 'd0b3f24f-4a9c-499b-99e4-343de48e7c82']);
    const sources = new Map(images.filter(image => !isImageAnAnnotation(image) && !excluded.has(image.uuid)).map(image => [image.uuid, image]));
    const groups = new Map();
    for (const image of images.filter(isImageAnAnnotation)) {
        const source = image.creation_process.input_image_uuid[0];
        if (!sources.has(source)) continue;
        if (!groups.has(source)) groups.set(source, { sourceImage: sources.get(source), annotationImages: [] });
        groups.get(source).annotationImages.push(image);
    }
    return groups;
}
