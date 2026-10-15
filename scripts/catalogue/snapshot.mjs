import { lstat, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest, regularFile } from './transport.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const accession = value => typeof value === 'string' && /^[a-z\d][a-z\d._-]{0,127}$/i.test(value);

async function records(directory, index) {
    const result = [];
    const names = (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort();
    if (index && canonical(names.map(name => name.slice(0, -5))) !== canonical(Object.keys(index.responses).sort())) throw new Error('Snapshot response inventory differs from its index.');
    for (const name of names) {
        const bytes = await regularFile(join(directory, name));
        const hash = digest(bytes);
        if (index && hash !== index.responses[name.slice(0, -5)]) throw new Error(`Snapshot response hash mismatch: ${name}`);
        const record = JSON.parse(bytes);
        if (!object(record) || typeof record.request !== 'string' || digest(record.request) + '.json' !== name || !integer(record.status) || record.status < 200 || record.status > 599 || !Array.isArray(record.headers) || !record.headers.every(header => Array.isArray(header) && header.length === 2 && header.every(value => typeof value === 'string')) || typeof record.body !== 'string' || Buffer.from(record.body, 'base64').toString('base64') !== record.body) throw new Error(`Malformed snapshot response: ${name}`);
        const request = JSON.parse(record.request);
        const url = new URL(request.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !Array.isArray(request.headers)) throw new Error('Malformed snapshot request.');
        result.push({ record, url, id: name.slice(0, -5), hash });
    }
    return result;
}

function json(record) {
    if (record.status < 200 || record.status >= 300) throw new Error('Required catalogue input was unavailable.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(record.body, 'base64')));
}

/** Compare enumeration, full records, required enrichments and actual generated study routes. */
export function catalogueCoverage(entries, environment, generatedAccessions, required) {
    if (!required) return { required: false, count: 0, accessions: [] };
    const browsePath = new URL(`${environment.PUBLIC_SEARCH_API}/website/browse/study`).pathname;
    const pages = entries.filter(({ url }) => url.origin === new URL(environment.PUBLIC_SEARCH_API).origin && url.pathname === browsePath && [...url.searchParams.keys()].every(key => ['pagination.page', 'pagination.page_size'].includes(key)));
    const first = pages.find(({ url }) => url.searchParams.get('pagination.page') === '1');
    if (!first) throw new Error('Snapshot is missing catalogue enumeration.');
    const initial = json(first.record);
    const total = initial.hits?.total;
    const pageSize = Number(first.url.searchParams.get('pagination.page_size'));
    const pageCount = initial.pagination?.total_pages;
    if (!integer(total?.value) || total.relation !== 'eq' || !integer(pageSize) || pageSize < 1 || !integer(pageCount) || pageCount > 10000 || pageCount !== Math.ceil(total.value / pageSize) && !(total.value === 0 && pageCount === 1) || pages.length !== Math.max(1, pageCount)) throw new Error('Catalogue enumeration does not provide consistent exact totals.');
    const studies = [];
    for (let page = 1; page <= Math.max(1, pageCount); page++) {
        const matches = pages.filter(({ url }) => url.searchParams.get('pagination.page') === String(page) && url.searchParams.get('pagination.page_size') === String(pageSize));
        if (matches.length !== 1) throw new Error('Catalogue pagination has missing or ambiguous pages.');
        const data = json(matches[0].record);
        if (!Array.isArray(data.hits?.hits) || data.hits.total?.value !== total.value || data.hits.total?.relation !== 'eq' || data.pagination?.total_pages !== pageCount || data.pagination?.page !== page || data.hits.hits.length !== Math.min(pageSize, Math.max(0, total.value - (page - 1) * pageSize))) throw new Error('Catalogue pagination is incomplete or changed during retrieval.');
        studies.push(...data.hits.hits.map(hit => hit?._source));
    }
    const ids = studies.map(study => study?.accession_id);
    if (studies.length !== total.value || ids.some(id => !accession(id)) || new Set(ids).size !== ids.length) throw new Error('Catalogue routes are invalid, incomplete or duplicated.');
    const byURL = new Map();
    for (const entry of entries) {
        if (!byURL.has(entry.url.href)) byURL.set(entry.url.href, []);
        byURL.get(entry.url.href).push(entry.record);
    }
    function requiredInput(value) {
        const matches = byURL.get(new URL(value).href);
        if (matches?.length !== 1) throw new Error(`Snapshot is missing or has ambiguous required input: ${value}`);
        return json(matches[0]);
    }
    for (const summary of studies) {
        const id = summary.accession_id;
        const detail = requiredInput(`${environment.PUBLIC_SEARCH_API}/website/study?facet.accession_id=${encodeURIComponent(id)}`);
        const study = detail.hits?.hits?.[0]?._source;
        if (detail.hits?.hits?.length !== 1 || study?.accession_id !== id || summary.uuid && study.uuid !== summary.uuid) throw new Error(`Full study record does not match catalogue accession ${id}.`);
        if (!id.includes('EMPIAR')) {
            const info = requiredInput(`https://www.ebi.ac.uk/biostudies/api/v1/studies/${id}/info`);
            if (!object(info) || ['httpLink', 'globusLink'].some(key => info[key] != null && typeof info[key] !== 'string')) throw new Error(`Invalid file-service metadata for ${id}.`);
        }
        if (Array.isArray(study.image) && study.image.length) {
            const flags = requiredInput(`${environment.PUBLIC_SEARCH_API}/website/browse/image?facet.accession_id=${encodeURIComponent(id)}&has.specimen_track_display_image=false&pagination.page_size=1`);
            if (!integer(flags.hits?.total?.value)) throw new Error(`Invalid specimen-track count for ${id}.`);
        }
    }
    const expected = [...ids].sort();
    if (generatedAccessions && canonical([...generatedAccessions].sort()) !== canonical(expected)) throw new Error('Generated study routes differ from the complete catalogue.');
    return { required: true, count: ids.length, accessions: expected };
}

async function generatedStudies(root) {
    for (const prefix of ['artifacts/dist/bioimage-archive/client/study', 'artifacts/dist/bioimage-archive/study']) {
        try {
            const directory = join(root, prefix);
            const names = await readdir(directory);
            for (const name of names) if (!(await lstat(join(directory, name, 'index.html'))).isFile()) throw new Error('Generated study route has no regular HTML file.');
            return names;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return [];
}

export async function sealSnapshot(directory, { root, required, source }) {
    const environment = JSON.parse(await regularFile(join(directory, 'environment.json')));
    const entries = await records(directory);
    const catalogue = catalogueCoverage(entries, environment, await generatedStudies(root), required);
    const index = { format: 1, createdAt: new Date().toISOString(), source, environment, catalogue,
        unavailable: entries.filter(({ record }) => record.status >= 400).map(({ url, record }) => ({ url: url.href, status: record.status })),
        responses: Object.fromEntries(entries.map(({ id, hash }) => [id, hash])) };
    await writeFile(join(directory, 'index.json'), canonical(index) + '\n', { flag: 'wx' });
    return index;
}

export async function verifySnapshot(directory, { root, required } = {}) {
    if (!(await lstat(directory)).isDirectory()) throw new Error('Snapshot must be a real directory.');
    const index = JSON.parse(await regularFile(join(directory, 'index.json')));
    if (index.format !== 1 || !object(index.environment) || !object(index.responses) || !object(index.catalogue) || typeof index.catalogue.required !== 'boolean' || Object.entries(index.responses).some(([id, hash]) => !/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid snapshot index.');
    const entries = await records(directory, index);
    const coverage = catalogueCoverage(entries, index.environment, root ? await generatedStudies(root) : undefined, required ?? index.catalogue.required);
    if (canonical(coverage) !== canonical(index.catalogue)) throw new Error('Snapshot catalogue coverage differs from its index.');
    return index;
}
