import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isImageOptimizer, securityHeaders } from "../src/security/headers.mjs";
import { logEvent } from "../src/observability/events.mjs";
import { deploymentConfiguration } from "./deployment/manifest.mjs";

// Use the adapter's standalone handler while applying headers to assets, static pages and errors too.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const configuration = process.env.DEPLOYMENT_MANIFEST
    ? await deploymentConfiguration(process.env.DEPLOYMENT_MANIFEST)
    : process.env;
const headers = securityHeaders(configuration.PUBLIC_ALLOW_LOCAL_VIEWERS === "true");
const { handler } = await import("../artifacts/dist/bioimage-archive/server/entry.mjs");
let stopping = false;
const listener = (request, response) => {
    const started = performance.now();
    const requestId = randomUUID();
    response.setHeader('X-Request-ID', requestId);
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    let pathname;
    try { pathname = new URL(request.url, "http://localhost").pathname; }
    catch { response.writeHead(400); response.end("Bad request."); return; }
    response.once('finish', () => {
        const durationMs = Math.round(performance.now() - started);
        if (response.statusCode >= 400 || durationMs >= 1000) logEvent('http_request', { requestId: response.getHeader('X-Request-ID'), method: request.method, path: pathname.slice(0, 256), status: response.statusCode, durationMs });
    });
    if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD", Connection: "close" }); response.end("Method not allowed."); return;
    }
    if (pathname === '/health/live' || pathname === '/health/ready') {
        const ready = pathname === '/health/live' || !stopping;
        response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ status: ready ? 'ok' : 'stopping' })); return;
    }
    if (isImageOptimizer(pathname)) { response.writeHead(404); response.end("Not found."); return; }
    const failed = error => {
        logEvent('request_failed', { requestId: response.getHeader('X-Request-ID'), path: pathname.slice(0, 256), errorType: error instanceof Error ? error.name : 'UnknownError' });
        if (response.headersSent) response.destroy();
        else { response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Page temporarily unavailable.'); }
    };
    try { Promise.resolve(handler(request, response)).catch(failed); }
    catch (error) { failed(error); }
};
const port = Number(process.env.PORT ?? 8080);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new RangeError("Invalid listening port.");
if (Boolean(process.env.SERVER_CERT_PATH) !== Boolean(process.env.SERVER_KEY_PATH)) throw new Error("TLS requires both certificate and key paths.");
const server = process.env.SERVER_CERT_PATH
    ? createSecureServer({ cert: await readFile(process.env.SERVER_CERT_PATH), key: await readFile(process.env.SERVER_KEY_PATH) }, listener)
    : createServer(listener);
const shutdown = () => {
    if (stopping) return;
    stopping = true;
    logEvent('server_stopping', { drainTimeoutMs: 10000 });
    // Containers send SIGTERM to PID 1; drain requests before the orchestrator's kill deadline.
    const deadline = setTimeout(() => { logEvent('drain_timeout'); server.closeAllConnections(); process.exit(1); }, 10000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); logEvent('server_stopped'); process.exit(0); });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
server.listen(port, process.env.HOST ?? "127.0.0.1", () => logEvent('server_started', { port, host: process.env.HOST ?? '127.0.0.1', revision: (process.env.DEPLOYMENT_REVISION ?? 'unversioned').slice(0, 128) }));
