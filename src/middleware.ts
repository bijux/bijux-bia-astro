import { defineMiddleware } from "astro:middleware";
import { isImageOptimizer, securityHeaders } from "./security/headers.mjs";
import { logEvent } from "./observability/events.mjs";

export const onRequest = defineMiddleware(async (context, next) => {
    const started = performance.now();
    const headers = securityHeaders(import.meta.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true");
    const requestId = context.isPrerendered ? undefined : crypto.randomUUID();
    let response: Response;
    if (!["GET", "HEAD"].includes(context.request.method)) {
        response = new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } });
    } else if (isImageOptimizer(context.url.pathname)) {
        response = new Response("Not found.", { status: 404 });
    } else {
        try { response = await next(); }
        catch (error) {
            // A failed prerender must stop the build, rather than publish an error as a static page.
            if (context.isPrerendered) throw error;
            // Detailed upstream/runtime errors belong to operator diagnostics, never HTML.
            logEvent('page_render_failed', { requestId, path: context.url.pathname.slice(0, 256), errorType: error instanceof Error ? error.name : 'UnknownError' });
            response = new Response("Page temporarily unavailable.", { status: 502 });
        }
    }
    // Redirect responses can carry immutable headers. Clone without buffering their body.
    const secured = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
    for (const [name, value] of Object.entries(headers)) secured.headers.set(name, value);
    if (requestId) secured.headers.set('X-Request-ID', requestId);
    const durationMs = Math.round(performance.now() - started);
    if (requestId && (secured.status >= 400 || durationMs >= 1000)) logEvent('page_response', { requestId, path: context.url.pathname.slice(0, 256), status: secured.status, durationMs });
    return secured;
});
