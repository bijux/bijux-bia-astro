import { transcriptFiles } from './transcript-records.mjs';

/** Preserve catalogue order and stop at the first transcript dataset; malformed services are failures. */
export async function studyHasTranscripts(datasetUUIDs, apiURL, request) {
    for (const uuid of datasetUUIDs) {
        const files = await request(`${apiURL}/dataset/${encodeURIComponent(uuid)}/file_reference?page_size=1000`);
        const found = transcriptFiles(files, uuid).length > 0;
        if (found) return true;
    }
    return false;
}
