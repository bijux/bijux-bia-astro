import { isRootImage } from './relationships/position.mjs';
import type { Image, SpecimenInfo, Licence } from '../../api/types.ts';

interface ImageStudy {
    accession_id: string;
    title?: string | null;
    description?: string | null;
    licence_details: Licence;
    dataset: { uuid: string; title?: string | null; description?: string | null }[];
}

interface ImageClient {
    getImageFromAPI(uuid: string): Promise<Image | null>;
    getStudyFromApiByAccession(accession: string): Promise<ImageStudy | undefined>;
    getImagesFromAPI(uuids: string[]): Promise<(Image | null)[]>;
    getDownstreamDisplayImages(uuid: string): Promise<Image[]>;
}

type PageImage = Image & { accession_id: string; licence_details: Licence };

function assertPageImage(image: Image): asserts image is PageImage {
    if (typeof image.accession_id !== 'string' || !image.accession_id) throw new TypeError('Image page requires a study accession.');
    if (!image.licence_details) throw new TypeError('Image page requires licence metadata.');
}

export interface ImagePageData {
    image: PageImage;
    study: ImageStudy;
    dataset: ImageStudy['dataset'][number] | undefined;
    inputImages: Image[];
    upstreamImages: Image[];
    downstreamImages: Image[];
    segmentationImages: Image[];
    specimen: SpecimenInfo | null;
    inheritedSpecimens: SpecimenInfo[];
    hasSpecimenTracks: boolean;
}

/** No representation is invented for an absent related image. Preserve object identity and ordering. */
function requiredImages(images: (Image | null)[], relation: string): Image[] {
    return images.map(image => {
        if (!image) throw new Error(`Missing ${relation} image referenced by the image page.`);
        return image;
    });
}

/** The primary image may be absent; required upstream failures remain visible to the route. */
export async function loadImagePage(uuid: string, client: ImageClient): Promise<ImagePageData | null> {
    const image = await client.getImageFromAPI(uuid);
    if (!image) return null;
    assertPageImage(image);
    const study = await client.getStudyFromApiByAccession(image.accession_id);
    if (!study) throw new Error(`Image ${image.uuid} references an unavailable study.`);
    if (!study.licence_details) throw new TypeError('Image page requires study licence metadata.');
    const creation = image.creation_process;
    const [inputs, upstream, downstream, segmentations] = await Promise.all([
        client.getImagesFromAPI(creation?.input_image_uuid ?? []),
        client.getImagesFromAPI(image.upstream_image_uuids ?? []),
        image.specimen_track_position === 'internal' ? client.getDownstreamDisplayImages(image.uuid) : [],
        client.getImagesFromAPI(image.segmentation_image_uuids ?? []),
    ]);
    const inputImages = requiredImages(inputs, 'input');
    const upstreamImages = requiredImages(upstream, 'upstream');
    const downstreamImages = requiredImages(downstream, 'downstream');
    const segmentationImages = requiredImages(segmentations, 'segmentation');
    const specimen = creation?.subject ?? null;
    const inherited = specimen == null ? upstreamImages.find(isRootImage)?.creation_process?.subject : null;
    return {
        image, study, dataset: study.dataset.find(dataset => dataset.uuid === image.submission_dataset_uuid),
        inputImages, upstreamImages, downstreamImages, segmentationImages, specimen,
        inheritedSpecimens: inherited ? [inherited] : [],
        hasSpecimenTracks: (image.specimen_track_position === 'terminal' && upstreamImages.length > 0) ||
            (image.specimen_track_position === 'segmentation' && inputImages.length > 0) ||
            (image.specimen_track_position === 'internal' && downstreamImages.length > 0) || segmentationImages.length > 0,
    };
}
