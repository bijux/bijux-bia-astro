# Security checks

The security audit records source-review candidates and locked dependency advisories. It does not certify that the application is free of vulnerabilities. Use Node 22 and a Git checkout with locked dependencies installed:

```sh
npm ci
npm test
npm run astro -- check
npm run audit:security
```

`npm test` discovers all `tests/**/*.test.mjs` suites. There is no separate security test command. To run the same checks through Make, use `make security` or `make -j2 security`; the latter runs isolated tests alongside the source check, then starts the combined audit after both succeed.

For a focused inventory, use `npm run audit:security -- code` or `npm run audit:security -- deps`. These profiles disclose the coverage they did not run and do not replace the combined summary.

| Audit exit | Meaning |
| --- | --- |
| 0 | Requested stages completed without configured findings. |
| 1 | Analysis completed and retained candidates or advisory matches require review. |
| 2 | Required inputs, provenance, execution or output could not be verified. |

Make propagates a failed recipe, normally as exit 2. This is distinct from the audit runner's exit 2. Do not suppress a nonzero result to make the gate green.

## Evidence and coverage

`artifacts/security/security.log` identifies the owned run directory under `artifacts/security/runs/`. Each run preserves its JSON report, raw analyzer output, subprocess outcomes, installed versions, Git provenance and input hashes. Code-only and dependency-only summaries have their own filenames. Generated evidence is ignored by Git.

The code stage uses installed, locked ESLint tools with Astro and TypeScript parsing. Fifteen installed-analyzer probes check unsafe and safe syntax, client scripts and parser failures. Every selected file must produce its expected result. Source hashes and the selected file set are checked again before the combined report is published, including after the registry request. Inline suppression, missing results, unsafe file inputs, inconsistent reports, tool failures and hard deadlines make a run incomplete.

The inventory includes untracked source and root configuration. Only root generated directories are excluded: `.git`, `node_modules`, `.astro`, `.netlify`, `dist`, `coverage` and `artifacts`. A similarly named directory inside `src` is still inspected. HTML, MDX, YAML, JSON and other non-JavaScript formats are inventoried but are not claimed as ESLint-analyzed code. Source files are not executed by the analyzer probes.

The dependency stage runs one explicit npm registry audit against the lockfile, including production, development, optional and peer dependencies. Missing or inconsistent manifests, malformed advisory records, unresolved advisory aliases and registry errors cannot produce a clean result. Registry results may change without a source change.

History secret scanning, CodeQL, passive browser scanning, external CDN inspection and deployment checks are separate investigations. They are not hidden inside `npm test` or the default audit. Test fixtures use saved or controlled API data; they do not reproduce every live backend behavior.

## Application boundaries

Supplied text is escaped before intentional HTML rendering. Script JSON escapes HTML raw-text delimiters; URLs are checked for supported schemes and credentials. Native DOM nodes replace unsafe HTML construction in the reviewed training, annotation and download controls. Shell commands are displayed and copied, never executed by the application.

Resource URLs require absolute HTTP(S) destinations. Private/local address literals and local hostnames are rejected by default; this is a browser destination policy, not DNS-based SSRF protection. Authored site assets and generated study placeholders retain their local paths. `PUBLIC_ALLOW_LOCAL_VIEWERS=true` is an explicit trusted deployment mode for local viewer data. It changes browser permissions and must not be enabled for arbitrary untrusted content. Netlify's static permissions policy remains restrictive; any deployment-specific exception needs separate review.

Configured API requests have a 15-second deadline, an 8 MiB body limit and at most three same-origin redirects. Bulk helpers use bounded concurrency of four. Search controls reject ambiguous or oversized inputs before API requests. These are per-operation budgets, not a global server rate limit. Invalid mandatory catalogue pages, duplicate routes and failed prerenders stop the build instead of publishing a partial catalogue or error page. Optional EMPIAR/EMDB enrichment can fail with a diagnostic while preserving the remaining page.

Run the compiled Node service with `npm run prod`. It uses `src/server/host.mjs` so headers also cover static files and error responses. Starting the adapter entry directly bypasses that wrapper. The server defaults to loopback; set `HOST` and `PORT` explicitly for deployment. The container sets `HOST=0.0.0.0` and serves the verified build without compilation. Public settings are fixed at build time; rebuild to change them.

Netlify static headers are declared in the root `netlify.toml`; application middleware covers handled SSR responses. Framework or platform errors before middleware have separate ownership. `Content-Security-Policy-Report-Only` is diagnostic, not enforced XSS protection, and no report collector is configured. External viewers and CDN scripts remain additional trust boundaries.

## Remaining work

See [the security findings](security-findings.md) for changes, retained risks and verification limits. Framework and adapter versions are upgraded together. Image transformation remains disabled; remaining transitive advisories are tracked independently of that application policy.
