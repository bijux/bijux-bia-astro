export const reportOnlyPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://code.jquery.com https://cdn.datatables.net https://assets.emblstatic.net https://ebi.emblstatic.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://assets.emblstatic.net https://ebi.emblstatic.net https://cdn.datatables.net; img-src 'self' data: https:; font-src 'self' data: https://assets.emblstatic.net https://ebi.emblstatic.net; connect-src 'self' https:; frame-src 'self' https:";

export function securityHeaders(allowLocalViewers = false) {
    const local = allowLocalViewers ? '(self "https://livingobjects.ebi.ac.uk")' : "()";
    return {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy-Report-Only": reportOnlyPolicy,
        "Permissions-Policy": `camera=(), microphone=(), geolocation=(), loopback-network=${local}, local-network-access=${local}`,
    };
}

export function isImageOptimizer(pathname) {
    try { return decodeURIComponent(pathname).replace(/\/+$/, "").split("/").at(-1) === "_image"; }
    catch { return false; }
}
