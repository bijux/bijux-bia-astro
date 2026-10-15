# Security boundaries

See [verification](../verification.md) for audit commands, evidence and exit statuses.

## Application boundaries

Supplied text is escaped before intentional HTML rendering. Script JSON escapes HTML raw-text delimiters; URLs are checked for supported schemes and credentials. Native DOM nodes replace unsafe HTML construction in the reviewed training, annotation and download controls. Shell commands are displayed and copied, never executed by the application.

Resource URLs require absolute HTTP(S) destinations. Private/local address literals and local hostnames are rejected by default; this is a browser destination policy, not DNS-based SSRF protection. Authored site assets and generated study placeholders retain their local paths. `PUBLIC_ALLOW_LOCAL_VIEWERS=true` is an explicit trusted deployment mode for local viewer data. It changes browser permissions and must not be enabled for arbitrary untrusted content. Netlify's static permissions policy remains restrictive; any deployment-specific exception needs separate review.

Configured API requests have a 15-second deadline, an 8 MiB body limit and at most three same-origin redirects. Bulk helpers use bounded concurrency of four. Search controls reject ambiguous or oversized inputs before API requests. These are per-operation budgets, not a global server rate limit. Invalid mandatory catalogue pages, duplicate routes and failed prerenders stop the build instead of publishing a partial catalogue or error page. Optional EMPIAR/EMDB enrichment can fail with a diagnostic while preserving the remaining page.

Run the compiled Node service with `npm run prod`. It uses `src/server/host.mjs` so headers also cover static files and error responses. Starting the adapter entry directly bypasses that wrapper. The server defaults to loopback; set `HOST` and `PORT` explicitly for deployment. The container sets `HOST=0.0.0.0` and serves the verified build without compilation. Public settings are fixed at build time; rebuild to change them.

Netlify static headers are declared in the root `netlify.toml`; application middleware covers handled SSR responses. Framework or platform errors before middleware have separate ownership. `Content-Security-Policy-Report-Only` is diagnostic, not enforced XSS protection, and no report collector is configured. External viewers and CDN scripts remain additional trust boundaries.

## Remaining work

See [the security findings](security-findings.md) for changes, retained risks and verification limits. Framework and adapter versions are upgraded together. Image transformation remains disabled; remaining transitive advisories are tracked independently of that application policy.
