/** Select from validated file records without changing their identity or supplied order. */
export function selectTranscriptFiles(files) {
    return files.filter(file => (file.additional_metadata ?? []).some(attribute => {
        if (attribute.name !== 'attributes_from_biostudies.File') return false;
        const attributes = attribute.value?.attributes;
        const description = attributes?.Description;
        return attributes?.Data_Type === 'transcripts' || attributes?.Data_Type === 'Transcript_Coordinates' ||
            (typeof description === 'string' || Array.isArray(description)) &&
            (description.includes('Feature barcode') || description.includes('feature matrix'));
    }));
}
