# Verification

Use Node 22 and install locked dependencies with `npm ci`. Install the browser once:

```sh
PLAYWRIGHT_BROWSERS_PATH=artifacts/browsers npx playwright install --only-shell chromium
make verify
```

CI runs the same gate: source checking, all Node unit/functional suites, then a
representative production build, configured HTML validation, exact served-HTML
checks against the deployment manifest, and desktop/mobile Chromium journeys.
Linux CI also installs browser OS dependencies. Tests reject
unexpected API calls; captured responses and their provenance remain unchanged.
Synthetic cases cover missing metadata, failed requests and other boundaries.

For focused work, use `npm run check`, `npm test` or `npm run test:e2e`.
Browser setup lives in `tests/support/website`; shared Astro fixture builds live in
`tests/support/astro`. Logs, snapshots and traces stay under `artifacts/`.
External viewers, EMBL chrome, images, fonts and analytics are excluded from the
browser contract. These checks do not establish screen-reader or remote deployment behaviour.

## Audit inventories

Audits run separately from the deliverable gate. Passing `make verify` does not
mean that security advisories or static-review candidates have been resolved.

| Command | Purpose | Latest evidence |
| --- | --- | --- |
| `make audit-dead-code` | Astro-aware ESLint and Knip inventory | `artifacts/dead-codes.log` |
| `make audit-markup` | Astro and authored-HTML structure | `artifacts/markup-issues.log` |
| `make audit-security` | Source-review candidates and locked dependency advisories | `artifacts/security/security.log` |

The equivalent npm commands are `audit:dead-code`, `audit:markup` and
`audit:security`. Runner exit 0 means completion without blocking findings;
1 means completed analysis with findings; 2 means incomplete or invalid analysis.
Make has its own recipe-failure exit status: inspect the runner report for the cause.
Dead-code and markup accept `--report-only`, which permits findings but still fails
incomplete analysis. Security supports `-- code` and `-- deps` profiles; it has no
report-only bypass. Registry advisories can change independently of the lockfile.

Reports retain raw output, tool versions, coverage, Git provenance and input hashes.
Missing tools/results, malformed reports, changed inputs, unsafe files and hard
deadlines cannot become successful scans. Rules/configuration live in
`configs/audits`; bounded runners live in `scripts/audits`. Installed probes verify
the pinned analyser profiles. HTML inline validation directives remain reviewable
exceptions; changing tool versions requires rerunning their positive/negative cases.

After a successful full build, inspect generated HTML with:

```sh
npm run audit:markup -- --html-dir artifacts/dist/bioimage-archive/client
```

The optional `npm run audit:dead-code -- --report-only --with-astro-check` adds
stricter JavaScript/unused analysis. Existing type diagnostics can make that run
incomplete; it is not the normal passing source gate.

Live catalogue verification is separate: `npm run build:deployment` requires its
APIs. The manual `Live catalogue verification` workflow retains build logs and
completeness evidence, including failed runs. Security boundaries and unresolved
risks are described in [the security guidance](security.md).
