import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { securityHeaders } from "../../src/security/headers.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const marker = '<img data-security-probe="metadata" src="https://blocked.invalid/probe"> µ |';
let root, upstream, child, address;
let requests = [];
let upstreamMode = "valid";
const emptyBrowse = { hits: { hits: [], total: { value: 0 } }, facets: {}, pagination: { page: 1, page_size: 12, total_pages: 0, next_cursor: null } };

after(async () => {
    if (child && child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
    if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
    if (root) await rm(root, { recursive: true, force: true });
});

before(async () => {
    const imageDocument = JSON.parse(await readFile(path.join(repository, "tests/fixtures/api/image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json"), "utf8"));
    const studyDocument = JSON.parse(await readFile(path.join(repository, "tests/fixtures/api/study-s-biad3335-response.json"), "utf8"));
    const image = imageDocument.hits.hits[0]._source;
    const study = studyDocument.hits.hits[0]._source;
    study.accession_id = image.accession_id;
    study.dataset[0].uuid = image.submission_dataset_uuid;
    study.dataset[0].title = marker;
    image.licence_details = { uri: "javascript:window.securityProbe=1", label: marker };
    study.licence_details = { uri: "data:text/html,probe", label: marker };
    upstream = createServer((request, response) => {
        requests.push({ url: request.url, mode: upstreamMode });
        response.setHeader("Content-Type", "application/json");
        if (request.url.startsWith("/website/image")) {
            const missing = new URL(request.url, "http://localhost").searchParams.get("query") === "missing";
            response.end(JSON.stringify(missing ? { hits: { hits: [] } } : imageDocument));
        } else if (request.url.startsWith("/website/study")) response.end(JSON.stringify(studyDocument));
        else if (upstreamMode.startsWith("catalogue-")) {
            const page = Number(new URL(request.url, "http://localhost").searchParams.get("pagination.page"));
            const rows = page === 1 || upstreamMode === "catalogue-duplicate" ? [{ _source: { uuid: "study-1", accession_id: "S-BIAD1" } }] : ["catalogue-complete", "catalogue-path", "catalogue-route"].includes(upstreamMode) ? [{ _source: { uuid: "study-2", accession_id: upstreamMode === "catalogue-path" ? "../../outside" : upstreamMode === "catalogue-route" ? "S-BIAD1" : "EMPIAR-2" } }] : [];
            response.end(JSON.stringify({ hits: { hits: rows, total: { value: 2, relation: "eq" } }, pagination: { total_pages: 2 } }));
        }
        else response.end(JSON.stringify(upstreamMode === "valid" ? emptyBrowse : { privateDetail: "PRIVATE_UPSTREAM_DETAIL" }));
    });
    upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
    const api = `http://127.0.0.1:${upstream.address().port}`;
    const output = path.join(repository, "artifacts/security/http-fixtures");
    await mkdir(output, { recursive: true }); root = await mkdtemp(path.join(output, "application-"));
    await cp(path.join(repository, "src"), path.join(root, "src"), { recursive: true, filter: source => source !== path.join(repository, "src/pages") });
    for (const directory of ["image", "galleries/spatialomics/image", "galleries/ai/image"]) await mkdir(path.join(root, "src/pages", directory), { recursive: true });
    for (const name of ["images.astro", "studies.astro", "image/[uuid].astro", "galleries/spatialomics/image/[uuid].astro", "galleries/ai/image/[uuid].astro"]) await cp(path.join(repository, "src/pages", name), path.join(root, "src/pages", name));
    await mkdir(path.join(root, "scripts")); await cp(path.join(repository, "scripts/server.mjs"), path.join(root, "scripts/server.mjs"));
    await cp(path.join(repository, "scripts/deployment"), path.join(root, "scripts/deployment"), { recursive: true });
    await symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
    await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
    await writeFile(path.join(root, "astro.config.mjs"), `
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
export default defineConfig({ redirects:{'/legacy':'/bioimage-archive/headers'},security:{allowedDomains:[{hostname:'127.0.0.1',protocol:'http'}]},base:'/bioimage-archive',outDir:'./artifacts/dist/bioimage-archive',cacheDir:'./.astro-cache',vite:{cacheDir:'./.vite-cache'},
adapter:node({mode:'standalone',experimentalDisableStreaming:true}),image:{service:{entrypoint:'astro/assets/services/noop'}},
env:{schema:{PUBLIC_SEARCH_API:envField.string({access:'public',context:'client',default:${JSON.stringify(api)}}),PUBLIC_GTAG:envField.string({access:'public',context:'client',default:''}),PUBLIC_WEBSITE_STATE:envField.string({access:'public',context:'client',default:'DEV'})}}});
`);
    await writeFile(path.join(root, "src/pages/headers.astro"), '<html><body><h1>Static header coverage</h1></body></html>');
    await writeFile(path.join(root, "src/pages/runtime-error.astro"), '---\nexport const prerender = false;\nthrow new Error("PRIVATE_RENDERING_DETAIL");\n---\n');
    await writeFile(path.join(root, "src/pages/redirect.js"), 'export const prerender=false; export function GET({request}) { return Response.redirect(new URL("/bioimage-archive/headers",request.url),302); }');
    await writeFile(path.join(root, "src/pages/catalogue.json.js"), 'import {getAllStudiesFromAPI} from "../components/SharedJSFunctions.js";\nexport const prerender = false;\nexport async function GET(){return Response.json({count:(await getAllStudiesFromAPI()).length});}');
    const env = { ...process.env, PUBLIC_SEARCH_API: api, PUBLIC_GTAG: "", PUBLIC_ALLOW_LOCAL_VIEWERS: "false" };
    await promisify(execFile)(process.execPath, [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build", "--root", root], { cwd: root, env, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    const portServer = createServer(); portServer.listen(0, "127.0.0.1"); await once(portServer, "listening");
    const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
    address = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["scripts/server.mjs"], { cwd: root, env: { ...env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    let diagnostics = ""; child.stdout.on("data", value => { diagnostics += value; }); child.stderr.on("data", value => { diagnostics += value; });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try { if ((await fetch(address + "/bioimage-archive/headers")).ok) return; } catch { /* bounded startup polling */ }
        if (child.exitCode !== null) throw new Error(diagnostics);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Production fixture did not start: " + diagnostics);
});

describe("production rendering boundaries", { concurrency: false }, () => {
test("Netlify static header declarations match the default application policy", async () => {
    const source = await readFile(path.join(repository, 'netlify.toml'), 'utf8');
    const section = source.split('[[headers]]')[1];
    assert.match(section, /for\s*=\s*"\/\*"/);
    const values = Object.fromEntries([...section.matchAll(/^\s*"([^"]+)"\s*=\s*("(?:\\.|[^"\\])*")\s*$/gm)]
        .map(match => [match[1], JSON.parse(match[2])]));
    assert.deepEqual(values, securityHeaders());
});

test("actual search routes reject resource-limit inputs before the server sends an API request", async () => {
    for (const page of ["images", "studies"]) {
        const before = requests.length;
        const response = await fetch(`${address}/bioimage-archive/${page}?pagination.page_size=100000`);
        assert.equal(response.status, 400);
        assert.equal(requests.length, before);
        assert.match(await response.text(), /supported limits or are invalid/);
    }
});

test("malformed successful upstream responses produce an honest generic failure, not a clean empty result", async () => {
    upstreamMode = "malformed";
    try {
        const response = await fetch(`${address}/bioimage-archive/images?query=mouse`);
        assert.equal(response.status, 502);
        assert.doesNotMatch(await response.text(), /PRIVATE_UPSTREAM_DETAIL|Invalid browse response|\.astro:\d/);
    } finally { upstreamMode = "valid"; }
});

test("unexpected runtime rendering errors do not expose operator details to the browser", async () => {
    const response = await fetch(`${address}/bioimage-archive/runtime-error`);
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Page temporarily unavailable.");
});

test("redirects keep their status and destination when security headers are applied", async () => {
    const response = await fetch(`${address}/bioimage-archive/redirect`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), address + "/bioimage-archive/headers");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    const configured = await fetch(`${address}/bioimage-archive/legacy`, { redirect: 'manual' });
    assert.equal(configured.status, 301);
    assert.equal(new URL(configured.headers.get('location'), address).pathname, '/bioimage-archive/headers');
});

test("unapproved Host and forwarded hosts cannot control redirect destinations", async () => {
    for (const headers of [{ Host: 'attacker.invalid' }, { 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https' }]) {
        const response = await fetch(`${address}/bioimage-archive/redirect`, { redirect: 'manual', headers });
        assert.equal(response.status, 302);
        assert.notEqual(new URL(response.headers.get('location')).hostname, 'attacker.invalid');
    }
});

test("read-only application routes reject body-bearing methods without contacting the API", async () => {
    const before = requests.length;
    const response = await fetch(`${address}/bioimage-archive/images`, { method: "POST", body: "ignored body" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(requests.length, before);
});

test("actual catalogue consumers reject missing and duplicate pages instead of publishing partial data", async () => {
    try {
        upstreamMode = "catalogue-complete";
        const complete = await fetch(`${address}/bioimage-archive/catalogue.json`);
        assert.equal(complete.status, 200);
        assert.deepEqual(await complete.json(), { count: 2 }, JSON.stringify(requests.slice(-4)));
        for (const mode of ["catalogue-missing", "catalogue-duplicate", "catalogue-path", "catalogue-route"]) {
            upstreamMode = mode;
            const response = await fetch(`${address}/bioimage-archive/catalogue.json`);
            assert.equal(response.status, 502, mode);
            assert.equal(await response.text(), "Page temporarily unavailable.");
        }
    } finally { upstreamMode = "valid"; }
});

test("image metadata retains supplied text while executable licence links are disabled; missing images return 404", async () => {
    const response = await fetch(`${address}/bioimage-archive/image/001b8ef2-7a5e-4b94-b91c-d93f5095ee39`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, /href="(?:javascript:|data:)|<img\b[^>]*data-security-probe/);
    assert(html.includes("&lt;img data-security-probe="));
    assert(html.includes("µ |"));
    assert.equal((await fetch(`${address}/bioimage-archive/image/missing`)).status, 404);
    assert.equal((await fetch(`${address}/bioimage-archive/image/11111111-1111-1111-1111-111111111111`)).status, 404, "An unrelated browse hit must not become the requested image.");
});

test("every image route rejects a missing image before requesting study metadata", async () => {
    for (const prefix of ['image', 'galleries/ai/image', 'galleries/spatialomics/image']) {
        const before = requests.length;
        const response = await fetch(`${address}/bioimage-archive/${prefix}/missing`);
        assert.equal(response.status, 404);
        assert.equal(requests.length, before);
    }
});

test("a failed prerender cannot be converted into a successful build containing an error page", async () => {
    await writeFile(path.join(root, "src/pages/prerender-error.astro"), '---\nthrow new Error("Controlled prerender failure");\n---\n');
    try {
        await assert.rejects(promisify(execFile)(process.execPath, [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build", "--root", root],
            { cwd: root, timeout: 120000, maxBuffer: 2 * 1024 * 1024 }), error => error.code !== 0 && /Controlled prerender failure/.test(error.stderr + error.stdout));
    } finally { await rm(path.join(root, "src/pages/prerender-error.astro")); }
});

test("the production wrapper serves security headers on static, SSR, error and blocked optimizer responses", async () => {
    for (const pathname of ["headers", "images", "image/missing", "_image?href=https%3A%2F%2Fblocked.invalid%2Fprobe.avif", "%5fimage"]) {
        const response = await fetch(`${address}/bioimage-archive/${pathname}`);
        for (const [name, value] of Object.entries(securityHeaders())) assert.equal(response.headers.get(name), value, `${pathname}: ${name}`);
        if (pathname.includes("image?") || pathname === "%5fimage") assert.equal(response.status, 404);
    }
});
});
