# BIA Astro prototype implementation

Use Node 22.22 or newer. `npm ci` stores dependencies and generated output under
`artifacts/`; root `node_modules`, `.astro` and `.netlify` are compatibility links.
Set `SITE_URL` at build time for a custom public origin; Netlify previews use
`DEPLOY_PRIME_URL`. Unapproved request hosts cannot control generated URLs.
`npm ci` supports this layout; `npm ls` may report spurious errors when inspecting
the dependency-directory link. Tests and audit probes execute the installed tools.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./artifacts/dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run local`           | Equivalent to build && preview                   |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

Note that:
`npm run dev` will update as you change things but may give a false impression of the final result, whereas running `npm run build` and then `npm run preview` will recreate what netlify runs, and will provide an accurate display of the website.


## Reproducible catalogue builds

`npm run build` captures public API responses used by the actual prerender into
`artifacts/catalogue/snapshots/`. A snapshot is published only after successful
rendering and validation of catalogue totals, full study records, required service
inputs and generated routes. The build prints its snapshot directory and report.

Replay with the same public configuration, including any `.env` values:

```sh
CATALOGUE_SNAPSHOT=artifacts/catalogue/snapshots/<capture-id> npm run build
```

Replay verifies response hashes and never falls back to live APIs. Identical build
requests share one result; upstream concurrency is bounded. HTTP error responses
remain visible in the snapshot index; transport failures prevent publication.
Snapshots stay outside public output and are not shipped in the runtime image.
This freezes captured inputs, not a transaction across independent upstream APIs.
The capture uses the default single-process prerenderer; concurrent page rendering
is supported, while experimental parallel-worker capture is rejected.

## Container deployment

Build the image once, then start that same image without compilation or catalogue
retrieval. Image creation requires the catalogue APIs and fails if retrieval or
rendering fails. Live search and image routes still contact their APIs on request.

```sh
docker build --build-arg PUBLIC_WEBSITE_STATE=PROD -t bia-website .
docker run --rm -p 8080:8080 bia-website
```

Pass `PUBLIC_SEARCH_API`, `PUBLIC_MONGO_API`, `PUBLIC_GTAG`,
`PUBLIC_WEBSITE_STATE`, `PUBLIC_ALLOW_LOCAL_VIEWERS` and `SITE_URL` as build
arguments when needed. The defaults match local builds. These are public settings,
not secrets; `.env` files are excluded from the image. Rebuild to change them.
Conflicting runtime overrides stop startup rather than silently taking no effect.

`HOST`, `PORT`, `SERVER_CERT_PATH` and `SERVER_KEY_PATH` remain runtime settings.
Mount certificate/key files together when using TLS. The image runs as `node` and
supports a read-only filesystem; it contains production dependencies and verified
output, with no application templates or build configuration. SIGTERM/SIGINT drain
active requests for up to ten seconds; allow a longer container stop timeout.

For a verified Node artifact outside Docker, run `npm run build:deployment`, then
`DEPLOYMENT_MANIFEST=artifacts/deployment/manifest.json npm run prod`. Package
`artifacts/dist/`, `artifacts/deployment/`, production dependencies and the server's
modules together. Docker verifies all output hashes after packaging; startup reads
only the baked configuration and does not repeat the catalogue build.

## Run linkchecker locally

Prerequisites
* install linkchecker: https://linkchecker.github.io/linkchecker/install.html

To test:
* build and preview locally: `npm run local`
* run: `linkchecker http://localhost:4321/bioimage-archive/ -o failures --no-warnings --ignore-url '.*\/vis\/?.*' --ignore-url '.*\/dataset\/?.*' --ignore-url '.*\/sodataset\/?.*' --ignore-url '.*\/aidataset\/?.*'` *

\* Note that on mac you may have to modify permissions of the /Users/$USER/.config/linkchecker to get this command to work.

You can also run this on the files genated by the build by running `npm run build` and then `linkchecker artifacts/dist/bioimage-archive/ ...`


## Verify local OME-Zarr display

When the frontend is configured for a local search API whose image records
refer to loopback MinIO, verify both parts of the local viewer path:

1. Open the Study page and confirm its selected hero image links to the
   corresponding Image page when the URI matches `image_static_display_uri`.
2. Open that Image page and confirm the embedded Vizarr viewer can read the
   local OME-Zarr source.

The standard Image page delegates the browser's loopback/private-network
permissions to the Vizarr iframe. Gallery-specific viewers are separate entry
points and are not covered by this check.


## Style guide

We follow: https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Writing_style_guide/Code_style_guide/JavaScript 
- Classes are PascalCase, which include any imported astro templates/files
- variables, objects, and functions are camelCase
Note that for astro, pages with dynamic route parameters should therefore be called `[camelCaseParameter].astro`
