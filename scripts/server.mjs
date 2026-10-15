import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFile } from "node:fs/promises";
import { isImageOptimizer, securityHeaders } from "../src/security/headers.mjs";

// Use the adapter's standalone handler while applying headers to assets, static pages and errors too.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { handler } = await import("../artifacts/dist/bioimage-archive/server/entry.mjs");
const headers = securityHeaders(process.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true");
const listener = (request, response) => {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD", Connection: "close" }); response.end("Method not allowed."); return;
    }
    let pathname;
    try { pathname = new URL(request.url, "http://localhost").pathname; }
    catch { response.writeHead(400); response.end("Bad request."); return; }
    if (isImageOptimizer(pathname)) { response.writeHead(404); response.end("Not found."); return; }
    handler(request, response);
};
const port = Number(process.env.PORT ?? 8080);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new RangeError("Invalid listening port.");
if (Boolean(process.env.SERVER_CERT_PATH) !== Boolean(process.env.SERVER_KEY_PATH)) throw new Error("TLS requires both certificate and key paths.");
const server = process.env.SERVER_CERT_PATH
    ? createSecureServer({ cert: await readFile(process.env.SERVER_CERT_PATH), key: await readFile(process.env.SERVER_KEY_PATH) }, listener)
    : createServer(listener);
server.listen(port, process.env.HOST ?? "127.0.0.1");
