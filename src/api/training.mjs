import { fetchJSON } from './http.mjs';

const endpoints = {
    "live": "https://www.ebi.ac.uk/ebisearch/ws/rest/ebiweb_training_events?format=json&query=domain_source:ebiweb_training_events%20AND%20timeframe:upcoming&start=0&size=2&fieldurl=true&fields=title,description,start_date,end_date,date_time_clean,resource_training_page,type,training_type,url,venue,materials,status,timeframe,resource_training_page,course_image&facetcount=0&sort=start_date&facets=resource_training_page:BioImage%20Archive",
    "ondemand": "https://www.ebi.ac.uk/ebisearch/ws/rest/ebiweb_training_online?format=json&query=domain_source:ebiweb_training_online&start=0&size=2&fields=title,subtitle,description,type,url&sort=title&facets=resource_training_page:BioImage%20Archive"
};
const fieldsUsed = ['title', 'subtitle', 'description', 'type', 'url', 'status', 'date_time_clean', 'venue'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Load at most two cards from the fixed EBI Search endpoints, retaining supplied records.
 * @param {'live' | 'ondemand'} kind
 * @param {{request?: typeof fetchJSON, signal?: AbortSignal}} options
 */
export async function getTrainingEntries(kind, { request = fetchJSON, signal } = {}) {
    if (kind !== 'live' && kind !== 'ondemand') throw new TypeError('Invalid training category.');
    const response = await request(endpoints[kind], { maxBytes: 1024 * 1024, signal });
    const entries = Array.isArray(response) ? response : record(response) ? response.entries : null;
    if (!Array.isArray(entries)) throw new TypeError('Invalid training response.');
    const selected = entries.slice(0, 2);
    for (const item of selected) {
        if (!record(item) || !record(item.fields) || fieldsUsed.some(key => {
            const value = item.fields[key];
            return value != null && typeof value !== 'string' &&
                !(Array.isArray(value) && value.every(part => typeof part === 'string'));
        })) throw new TypeError('Invalid training record.');
        const title = Array.isArray(item.fields.title) ? item.fields.title[0] : item.fields.title;
        if (typeof title !== 'string' || !title.trim()) throw new TypeError('Training record has no title.');
    }
    return selected;
}
