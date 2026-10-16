import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const clientPrefix = 'artifacts/dist/bioimage-archive/client/';
const basePath = '/bioimage-archive/';
const resourceTags = new Set(['img', 'script', 'source', 'video', 'audio', 'track']);
const resourceLinks = new Set(['stylesheet', 'icon', 'apple-touch-icon', 'preload', 'modulepreload']);
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
const publicPath = file => basePath + file.slice(clientPrefix.length).split('/').map(encodeURIComponent).join('/');
const documentPath = file => publicPath(file).replace(/\/index\.html$/, '/');

/** Inspect active document nodes; templates and script/noscript text do not create live IDs. */
function references(document, parse, url) {
    const ids = new Set(), anchors = [], resources = [];
    let base;
    function visit(node) {
        const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
        if (attrs.id) ids.add(attrs.id);
        if (node.tagName === 'a') {
            if (attrs.name) ids.add(attrs.name);
            if (attrs.href) anchors.push(attrs.href);
        }
        if (node.tagName === 'base' && base === undefined && attrs.href) base = attrs.href;
        if (resourceTags.has(node.tagName) && attrs.src) resources.push(attrs.src);
        if (node.tagName === 'video' && attrs.poster) resources.push(attrs.poster);
        if (node.tagName === 'link' && attrs.href && attrs.rel?.split(/\s+/).some(rel => resourceLinks.has(rel))) resources.push(attrs.href);
        for (const child of node.childNodes ?? []) visit(child);
    }
    visit(parse(document));
    return { ids, anchors, resources, url: base === undefined ? url : new URL(base, url) };
}

/** Verify packaged image/media/script sources, resource links and generated fragments without fetching. */
export async function inspectDocumentReferences(root, files, siteURL) {
    // Build tooling is loaded only after the caller has checked its owned output directory.
    const { parse } = await import('parse5');
    const origin = new URL(siteURL).origin;
    const available = new Set(Object.keys(files).filter(file => file.startsWith(clientPrefix)));
    const documents = new Map(), pages = new Map();
    for (const file of [...available].filter(file => file.endsWith('.html')).sort()) {
        const url = new URL(documentPath(file), origin);
        const document = references(await readFile(join(root, file), 'utf8'), parse, url);
        documents.set(file, document);
        pages.set(decode(publicPath(file)), document);
        pages.set(decode(url.pathname), document);
        if (url.pathname.endsWith('/')) pages.set(decode(url.pathname.slice(0, -1)), document);
    }
    const result = { documents: documents.size, localResources: 0, generatedFragments: 0, deferredFragments: 0, failures: [] };
    for (const [file, document] of documents) {
        const label = file.slice(clientPrefix.length);
        for (const value of document.resources) {
            let target;
            try { target = new URL(value, document.url); }
            catch { result.failures.push(`${label}: invalid resource URL`); continue; }
            if (target.origin !== origin) continue;
            const pathname = decode(target.pathname);
            // Explicit absolute URLs may address another EBI service on the same hostname.
            if (!pathname.startsWith(basePath) && /^(?:https?:)?\/\//i.test(value.trim())) continue;
            result.localResources++;
            const asset = clientPrefix + pathname.slice(basePath.length);
            if (!pathname.startsWith(basePath) || !available.has(asset)) result.failures.push(`${label}: missing packaged resource ${pathname}`);
        }
        for (const value of document.anchors) {
            let target;
            try { target = new URL(value, document.url); }
            catch { result.failures.push(`${label}: invalid document link`); continue; }
            if (target.origin !== origin || !target.hash) continue;
            const fragment = decode(target.hash.slice(1).split(':~:')[0]);
            if (!fragment || fragment.toLowerCase() === 'top') continue;
            const page = pages.get(decode(target.pathname));
            if (!page) { result.deferredFragments++; continue; }
            result.generatedFragments++;
            if (!page.ids.has(fragment)) result.failures.push(`${label}: missing generated fragment ${target.pathname}#${fragment}`);
        }
    }
    return result;
}
