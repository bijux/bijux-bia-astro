# Security boundaries and remaining risks

Supplied text is escaped before deliberate markup; script JSON escapes raw-text
terminators. URL policies reject unsupported schemes and credentials. Resource
policies reject local/private destinations by default. Shared policies live in
[`src/security`](../src/security); request budgets and redirects belong to
[`src/api/http.mjs`](../src/api/http.mjs).

Mandatory catalogue failures stop publication. Optional enrichment can emit a
diagnostic while retaining the page. Displayed download commands are copied,
never executed. SPORA's retained HTML templates consume versioned local data;
they are not a general renderer for untrusted API records.

The Node wrapper covers static files and errors with the header policy; start it
through `npm run prod`. Netlify static headers live in `netlify.toml`. Public
configuration is fixed at build time. See [deployment](deployment.md).

## Open risks

- The locked dependency audit retains build-time advisories. Node runtime installs
  omit build-only integrations; the complete audit still includes them. Regenerate
  [the audit](verification.md) after dependency changes;
  mutable registry counts belong in run evidence.
- A historical private-key candidate is absent from current source but remains
  in Git history. Retirement/revocation is unconfirmed and needs owner investigation.
  The audit did not use it to test access.
- CSP is report-only and has no report collector. External EMBL chrome, analytics
  and viewer documents remain separate trust boundaries.
- URL checks do not resolve DNS or prevent DNS rebinding/browser redirects to
  private services. `PUBLIC_ALLOW_LOCAL_VIEWERS=true` is an explicit trusted
  deployment mode; browser permissions need environment-specific verification.
- Request budgets are per operation, rather than global server rate limits.
  Static-review candidates require investigation; generic object access alone
  does not establish a vulnerability.

[Verification](verification.md) describes analyser coverage, incomplete runs and
retained raw evidence. CodeQL, history-secret scanning, external-service checks
and remote deployment verification are separate investigations. Passing the
application gate does not resolve those findings or certify every runtime state.
