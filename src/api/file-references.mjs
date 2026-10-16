import { fetchJSON } from './http.mjs';

/** Request a bounded dataset file inventory from the explicitly configured API root. */
export async function getFileReferences(apiRoot, datasetUUID, { request = fetchJSON, signal } = {}) {
    let base;
    try { base = typeof apiRoot === 'string' ? new URL(apiRoot) : null; } catch { base = null; }
    if (!base || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
        throw new TypeError('Invalid file API root.');
    }
    if (typeof datasetUUID !== 'string' || !datasetUUID.trim() || ['.', '..'].includes(datasetUUID) || /[\u0000-\u001f\u007f/\\]/.test(datasetUUID)) {
        throw new TypeError('Invalid dataset path identifier.');
    }
    const files = await request(`${base.href.replace(/\/$/, '')}/dataset/${encodeURIComponent(datasetUUID)}/file_reference?page_size=1000`, { signal });
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!Array.isArray(files) || files.length > 1000 || files.some(file => !record(file) ||
        ['uuid', 'file_path', 'uri'].some(key => file[key] != null && typeof file[key] !== 'string') ||
        file.additional_metadata != null && (!Array.isArray(file.additional_metadata) || !file.additional_metadata.every(record)))) {
        throw new TypeError(`Invalid file references for dataset ${datasetUUID}.`);
    }
    return files;
}
