/** Read a named value from the API's additional-metadata wrapper. */
export function getSimpleAttributeValue(obj, attrName) {
    return getMetadataValue(obj?.additional_metadata, attrName)?.[attrName] ?? null;
}

/** Combine supplied legacy categories and protocol terms as distinct display labels. */
export function getAnnotationType(datasets) {
    const labels = new Set();
    for (const dataset of Array.isArray(datasets) ? datasets : []) {
        const metadata = getMetadataValue(dataset?.additional_metadata, 'annotation_type');
        const supplied = typeof metadata === 'string' ? metadata : metadata?.annotation_type;
        const categories = typeof supplied === 'string' ? supplied.split(',')
            : Array.isArray(supplied) ? supplied.flat() : [];
        const protocols = Array.isArray(dataset?.annotation_process) ? dataset.annotation_process : [];
        const methods = protocols.flatMap(protocol => Array.isArray(protocol?.method_type) ? protocol.method_type : []);
        for (const term of [...categories, ...methods]) {
            if (typeof term !== 'string') continue;
            const label = term.replace(/_/g, ' ').trim().toLowerCase();
            if (label) labels.add(label);
        }
    }
    return [...labels].sort();
}

export function getMetadataValue(metadata, key, field = null) {
    const value = Array.isArray(metadata) ? metadata.find(entry => entry?.name === key)?.value : undefined;
    return field && value ? value[field]?.[0] : value;
}
