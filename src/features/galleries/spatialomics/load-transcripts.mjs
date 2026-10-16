import { selectTranscriptFiles } from './transcript-records.mjs';
import { getFileReferences } from '../../../api/file-references.mjs';

/** Preserve catalogue order and stop at the first transcript dataset; malformed services are failures. */
export async function studyHasTranscripts(datasetUUIDs, apiURL, request) {
    for (const uuid of datasetUUIDs) {
        const files = await getFileReferences(apiURL, uuid, { request });
        const found = selectTranscriptFiles(files).length > 0;
        if (found) return true;
    }
    return false;
}
