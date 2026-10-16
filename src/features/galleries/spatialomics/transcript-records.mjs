/** Validate the bounded file list, retaining matching records in their supplied order. */
export function transcriptFiles(files, datasetUUID) {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!Array.isArray(files) || files.length > 1000 || files.some(file => !record(file) ||
        file.additional_metadata != null && (!Array.isArray(file.additional_metadata) || !file.additional_metadata.every(record)))) {
        throw new TypeError(`Invalid transcript file metadata for dataset ${datasetUUID}.`);
    }
    return files.filter(file => (file.additional_metadata ?? []).some(attribute => {
        if (attribute.name !== 'attributes_from_biostudies.File') return false;
        const attributes = attribute.value?.attributes;
        const description = attributes?.Description;
        return attributes?.Data_Type === 'transcripts' || attributes?.Data_Type === 'Transcript_Coordinates' ||
            (typeof description === 'string' || Array.isArray(description)) &&
            (description.includes('Feature barcode') || description.includes('feature matrix'));
    }));
}
