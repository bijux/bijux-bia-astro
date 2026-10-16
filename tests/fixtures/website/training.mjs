import { readFileSync } from 'node:fs';

const provenance = JSON.parse(readFileSync(new URL('../api/provenance.json', import.meta.url)));
const captures = provenance.responses.filter(entry => entry.file.startsWith('training-'));

/** Only the captured EBI Search queries are permitted; unexpected fields or routes fail. */
export function trainingResponse(url) {
    if (url.origin !== 'https://www.ebi.ac.uk' || !url.pathname.startsWith('/ebisearch/ws/rest/')) return undefined;
    const capture = captures.find(entry => new URL(entry.url).href === url.href);
    if (!capture) throw new Error(`Unrecorded training request: ${url.pathname}${url.search}`);
    return JSON.parse(readFileSync(new URL(`../api/${capture.file}`, import.meta.url)));
}
