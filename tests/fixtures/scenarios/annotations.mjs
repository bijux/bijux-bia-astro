import { readFileSync } from 'node:fs';
const captured = name => JSON.parse(readFileSync(new URL(`../api/${name}-response.json`, import.meta.url))).hits.hits[0]._source;

// Synthetic annotation relationships supplement the unchanged, complete API captures.
export const annotationStudy = structuredClone(captured('study-empiar12104'));
annotationStudy.accession_id = 'S-BIAD999999';
export const sourceImage = structuredClone(captured('image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39'));
sourceImage.uuid = '00000000-0000-4000-8000-000000000001';
sourceImage.accession_id = annotationStudy.accession_id;
sourceImage.representation = [{ ...sourceImage.representation[0], image_format: '.ome.zarr', file_uri: ['https://example.org/source.ome.zarr'] }];
export const annotationImages = [2, 3].map(index => {
    const image = structuredClone(sourceImage);
    image.uuid = `00000000-0000-4000-8000-00000000000${index}`;
    image.submission_dataset_uuid = `annotation-dataset-${index}`;
    image.representation[0].file_uri = [`https://example.org/annotation-${index}.ome.zarr`];
    image.creation_process = { ...image.creation_process, input_image_uuid: [sourceImage.uuid] };
    annotationStudy.dataset.push({ uuid: image.submission_dataset_uuid, title: `Annotation dataset ${index}`, acquisition_process: [], annotation_process: [{ title: `Method ${index}`, method_type: [`type-${index}`], protocol_description: `Independent method ${index}` }] });
    return image;
});
