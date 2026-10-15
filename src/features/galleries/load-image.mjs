/** Gallery routes share primary-image lookup and required study resolution, but no extra image relations. */
export async function loadGalleryImage(uuid, client) {
    const image = await client.getImageFromAPI(uuid);
    if (!image) return null;
    if (!image.accession_id) throw new TypeError('Gallery image requires a study accession.');
    const study = await client.getStudyFromApiByAccession(image.accession_id);
    if (!study) throw new Error(`Gallery image ${image.uuid} references an unavailable study.`);
    return { image, study };
}
