import { defineMiddleware } from "astro:middleware";
import { isImageOptimizer, securityHeaders } from "./security/headers.mjs";

export const onRequest = defineMiddleware(async (context, next) => {
    const headers = securityHeaders(import.meta.env.PUBLIC_ALLOW_LOCAL_VIEWERS === "true");
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
            console.error("Page rendering failed.");
            response = new Response("Page temporarily unavailable.", { status: 502 });
        }
    }
    // Redirect responses can carry immutable headers. Clone without buffering their body.
    const secured = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
    for (const [name, value] of Object.entries(headers)) secured.headers.set(name, value);
    return secured;
});
