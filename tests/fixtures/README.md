# Synthetic HTTP fixtures

These records are invented test data, derived from the fields actually consumed by [shared API helpers](../../src/components/SharedJSFunctions.js), [study rendering](../../src/pages/study/[accessionID].astro), [image rendering](../../src/pages/image/[uuid].astro) and [search interfaces](../../src/components/search/SearchInterface.astro). They are not observations about a real study or live API compatibility. No patient records, submissions, copied imaging data or large downloads are included.

The primary study IDs are `S-BIAD90001` and `S-BIAD90002`. Their synthetic dataset has one image, two file references and 2,048 bytes. The image UUID is deterministic from the accession and its `submission_dataset_uuid` matches the study dataset. Its display URI matches the study hero URI. Every title, author and description identifies the data as synthetic. Curated gallery accessions come from the exact checked-in collections and benchmarking keys; the server supplies explicitly synthetic records for those route identifiers without changing production content.

`server.mjs` binds `127.0.0.1`, limits methods, URLs, payloads and request lifetimes, rejects undeclared routes and exposes success, empty, unknown, missing optional, malformed, delayed and failed scenarios through `fixture_case`. Request logs and all generated outputs belong under `artifacts/`. The synthetic OME-Zarr URI is a shell-wiring fixture and does not prove real image decoding.

`server-network.mjs` is an explicit Node preload for build/runtime validation. It maps inspected search, Mongo, BioStudies and training HTTP endpoints to the fixture and blocks undeclared HTTP destinations and non-loopback TCP connections. It is test wiring, not an operating-system sandbox. Dependency/browser provisioning happens separately before the preload is enabled. `browser-network.mjs` applies the same inspected HTTP map to a real Chromium context with service workers blocked. Unexpected origins are recorded and blocked; no production fallback exists.

```sh
npm run setup
PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/playwright-browsers" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/playwright-browsers" npm run fixture-test
npm run fixture-build -- node
```

Run Netlify separately with `npm run fixture-build -- netlify` in another snapshot so outputs and installs remain isolated. Builds use supported public API configuration and the explicit preload for hardcoded requests. Test builds set `ASTRO_TELEMETRY_DISABLED=1`; undeclared telemetry traffic fails the boundary. The Node wrapper also starts the actual built standalone entrypoint on an ephemeral loopback port and verifies that a Study and dynamic Image return synthetic titles; the Image request must reach the fixture API. This proves the runtime request seam, not complete page behavior. Existing production commands and defaults are untouched. Node and browser probes exercise actual HTTP traffic and intentional undeclared-host rejection. These boundary tests precede built-application journeys and do not establish browser UI behavior, third-party assets, viewer decoding or deployed platform behavior.
