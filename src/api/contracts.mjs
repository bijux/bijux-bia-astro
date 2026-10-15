export const searchLimits = Object.freeze({ pageSize: 100, page: 1000000, query: 2048, cursor: 8192, parameters: 100, value: 8192 });

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const records = value => Array.isArray(value) && value.every(object);
const optional = (value, key, predicate) => value[key] == null || predicate(value[key]);
const string = value => typeof value === 'string';

function licence(value) {
    return object(value) && ['uri', 'label', 'log_uri'].every(key => optional(value, key, string));
}

function representation(value) {
    return object(value) && ['uuid', 'image_format'].every(key => optional(value, key, string)) &&
        optional(value, 'file_uri', strings) &&
        ['size_x', 'size_y', 'size_z', 'size_c', 'size_t', 'voxel_physical_size_x', 'voxel_physical_size_y', 'voxel_physical_size_z']
            .every(key => optional(value, key, item => typeof item === 'number' && Number.isFinite(item)));
}

function specimen(value) {
    return object(value) && optional(value, 'uuid', string) &&
        ['sample_of', 'imaging_preparation_protocol'].every(key => optional(value, key, records));
}

function creation(value) {
    return object(value) && optional(value, 'input_image_uuid', strings) && optional(value, 'subject', specimen) &&
        ['acquisition_process', 'annotation_method', 'protocol'].every(key => optional(value, key, records));
}

/** Preserve API records; validate only the envelope and identity needed by callers. */
export function hitRecords(value) {
    if (!object(value) || !object(value.hits) || !Array.isArray(value.hits.hits) || value.hits.hits.some(hit => !object(hit) || !object(hit._source))) throw new TypeError('Invalid entity response.');
    return value.hits.hits;
}

export function selectedEntity(value, key, identifier) {
    const matches = hitRecords(value).filter(hit => hit._source[key] === identifier);
    if (matches.length > 1) throw new TypeError('Ambiguous entity response.');
    return matches[0]?._source;
}

export function studyRecord(value) {
    if (!object(value) || typeof value.accession_id !== 'string' || !Array.isArray(value.dataset) ||
        !value.dataset.every(dataset => object(dataset) && typeof dataset.uuid === 'string' && ['title', 'description'].every(key => optional(dataset, key, string))) ||
        !['title', 'description'].every(key => optional(value, key, string)) || !optional(value, 'licence_details', licence)) throw new TypeError('Invalid study datasets or metadata.');
    return value;
}

export function cataloguePage(value, page, pageSize, expectedTotal) {
    const hits = hitRecords(value);
    const total = value.hits.total;
    const pages = value.pagination?.total_pages ?? 1;
    if (!integer(total?.value) || total.relation != null && total.relation !== 'eq' || expectedTotal != null && total.value !== expectedTotal || !integer(pages) || pages > 10000 || hits.length > pageSize || value.pagination?.page != null && value.pagination.page !== page || pages === 0 && hits.length) throw new TypeError('Invalid or changing catalogue response.');
    return { hits, total: total.value, pages };
}

export function imageRecord(value) {
    if (!object(value) || typeof value.uuid !== 'string' || !Array.isArray(value.representation) || !value.representation.every(representation) ||
        !['accession_id', 'submission_dataset_uuid', 'specimen_track_position'].every(key => optional(value, key, string)) ||
        !['file_path', 'upstream_image_uuids', 'segmentation_image_uuids'].every(key => optional(value, key, strings)) ||
        !optional(value, 'total_size_in_bytes', item => typeof item === 'number' && Number.isFinite(item)) ||
        !optional(value, 'licence_details', licence) || !optional(value, 'creation_process', creation) ||
        !optional(value, 'additional_metadata', items => records(items) && items.every(item => ['name', 'provenance'].every(key => optional(item, key, string)))) ||
        !optional(value, 'file_list_attributes', items => records(items) && items.every(item => optional(item, 'value', value => object(value) && optional(value, 'attributes', object))))) throw new TypeError('Invalid image record.');
    return value;
}

export function imageCount(value) {
    if (!integer(value?.hits?.total?.value)) throw new TypeError('Invalid image count.');
    return value.hits.total.value;
}

/** Validate the browse contract before pagination arithmetic or component rendering. */
export function browseResponse(value) {
    const object = item => item !== null && typeof item === "object" && !Array.isArray(item);
    const integer = (item, minimum) => Number.isSafeInteger(item) && item >= minimum;
    const pagination = value?.pagination;
    if (!object(value) || !object(value.hits) || !Array.isArray(value.hits.hits) || value.hits.hits.length > searchLimits.pageSize || !value.hits.hits.every(hit => object(hit) && object(hit._source)) || !integer(value.hits.total?.value, 0) || !object(value.facets) || !object(pagination) || !integer(pagination.total_pages, 0) || !integer(pagination.page_size, 1) || pagination.page_size > searchLimits.pageSize || pagination.page != null && !integer(pagination.page, 0) || pagination.next_cursor != null && (typeof pagination.next_cursor !== "string" || pagination.next_cursor.length > searchLimits.cursor)) throw new TypeError("Invalid browse response.");
    return value;
}
