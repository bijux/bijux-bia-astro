/** Preserve catalogue order and stop at the first transcript dataset; malformed services are failures. */
export async function studyHasTranscripts(datasetUUIDs, apiURL, request) {
    for (const uuid of datasetUUIDs) {
        const files = await request(`${apiURL}/dataset/${encodeURIComponent(uuid)}/file_reference?page_size=1000`);
        if (!Array.isArray(files) || files.some(file => !file || typeof file !== 'object' || Array.isArray(file) ||
            file.additional_metadata != null && (!Array.isArray(file.additional_metadata) || file.additional_metadata.some(item => !item || typeof item !== 'object' || Array.isArray(item))))) {
            throw new TypeError(`Invalid transcript file metadata for dataset ${uuid}.`);
        }
        const found = files.flatMap(file => file.additional_metadata || []).some(attr =>
            attr.name === 'attributes_from_biostudies.File' && (
                attr.value?.attributes?.Data_Type === 'transcripts' ||
                attr.value?.attributes?.Data_Type === 'Transcript_Coordinates' ||
                attr.value?.attributes?.Description?.includes('Feature barcode') ||
                attr.value?.attributes?.Description?.includes('feature matrix')));
        if (found) return true;
    }
    return false;
}
