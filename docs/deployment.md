# Build and deployment

Catalogue collection and compilation happen before serving. `npm run build:deployment`
seals the required API inputs, validates catalogue completeness and generated routes,
and creates the verified artifact plus `artifacts/deployment/manifest.json`.

## Catalogue snapshots

`npm run build` captures responses under `artifacts/catalogue/snapshots/`. Replay
with the same public configuration recorded in the snapshot:

```sh
CATALOGUE_SNAPSHOT=artifacts/catalogue/snapshots/SNAPSHOT_ID npm run build:deployment
```

Replace `SNAPSHOT_ID` with a completed capture. Replay verifies hashes and never
falls back to live APIs. A capture freezes responses, not a transaction across
independent services. Mandatory retrieval/rendering failures stop publication.
Build reports stay under `artifacts/catalogue/builds/`.

Rendering concurrency defaults to four; `CATALOGUE_RENDER_CONCURRENCY` accepts
1–8. Snapshot capture uses the default single-process prerenderer; experimental
parallel-worker capture is unsupported.

## Public and runtime settings

Set public API origins, analytics, site state, local-viewer mode and `SITE_URL` at
build time. Names and defaults are defined in
[`src/server/configuration.mjs`](../src/server/configuration.mjs). Netlify previews
use `DEPLOY_PRIME_URL` when no `SITE_URL` is supplied. These settings are public,
not secrets; rebuild to change them. Conflicting runtime overrides stop startup.

`HOST`, `PORT`, `SERVER_CERT_PATH` and `SERVER_KEY_PATH` are runtime settings. Set
certificate/key paths together when mounting TLS files. Start the verified Node
wrapper with `npm run prod`; launching the adapter entry directly bypasses its
static-file headers, health checks and request handling.

## Containers and Helm

```sh
docker build --build-arg PUBLIC_WEBSITE_STATE=PROD -t bia-website .
docker run --rm -p 8080:8080 bia-website
```

The Dockerfile accepts the public settings as build arguments. Image creation
requires its APIs; startup serves the baked artifact as a non-root user without
compilation. Search/image requests still need their APIs. The Dockerfile defines
the runtime package; snapshots and application templates are not shipped.

`/health/live` and `/health/ready` make no upstream requests. They establish local
server readiness, not API availability. Shutdown drains requests for up to ten
seconds; allow a longer container termination timeout. Runtime responses carry
`X-Request-ID`; startup, error and slow-request logs are structured JSON.

Use an immutable image reference and follow the [Helm instructions](../helm-chart/README.md)
for rolling deployment and rollback. Netlify uses its own adapter and root
`netlify.toml`; local Node verification does not establish remote deployment health.
