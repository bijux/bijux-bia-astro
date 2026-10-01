# Route and public configuration reference

This is a source inventory at `808857d90a142ab0dc10c873ec44a2e24a344a76`, not a promise that every route or redirect has passed a runtime check. The Astro base is `/bioimage-archive`; paths below are relative to that prefix. Dynamic parameters describe source patterns rather than literal URLs.

## Page families

Each row lists the actual files under [src/pages](../../src/pages). There are 45 page files. Files ending in `.md` or `.mdx` also participate in routing.

| Family | Source files relative to `src/pages/` |
| --- | --- |
| Landing and discovery | `index.astro`, `studies.astro`, `images.astro`, `galleries.astro`, `case-studies.astro`, `contributors.astro`, `projects.astro` |
| Standard Study and Image | `study/[accessionID].astro`, `image/[uuid].astro` |
| Gallery landings | `galleries/ai.astro`, `galleries/cryoet.astro`, `galleries/spatialomics.astro`, `galleries/vem.astro`, `galleries/volumeem.astro` |
| AI gallery | `galleries/ai/ai-ready-studies.astro`, `galleries/ai/ai-ready-study/[accessionID].astro`, `galleries/ai/analysed-studies.astro`, `galleries/ai/analysed-study/[accessionID].astro`, `galleries/ai/image/[uuid].astro`, `galleries/ai/models.astro`, `galleries/ai/model/[modelName].astro` |
| Spatialomics gallery | `galleries/spatialomics/study/[accessionID].astro`, `galleries/spatialomics/image/[uuid].astro` |
| Help | `help.mdx`, `help/about-the-new-website.mdx`, `help/downloading-data.mdx`, `help/explore-file-list.mdx`, `help/faq.md`, `help/galleries-contribute.md`, `help/search.mdx`, `help/submitting-data.md`, `help/supporting-tools.md` |
| Legacy help documents | `help-file-list.mdx`, `mifa-help-overview.mdx`, `rembi-help-examples.mdx` |
| Projects | `projects/spora.astro`, `projects/spora/dataset.astro` |
| About, policy, and submission | `about-us.mdx`, `contact-us.md`, `logos.mdx`, `policies.md`, `policies/imagesatebi.md`, `project-developments.mdx`, `scope.md`, `submit.mdx` |

The static Study route gets its generated accession IDs from the API. The standard Image route uses server rendering. Gallery routes have their own implementations; a successful standard Image case does not establish their behavior.

| Boundary | Concrete characterization cases | Observed status |
| --- | --- | --- |
| Static Study | `study/S-BIAD2258/`; `study/UNKNOWN-ACCESSION/`; a reserved-character or Unicode identifier | Known Study returned HTML 200 with title TREC; absent/malformed behavior not run |
| Server Image | A UUID selected from that Study; `image/not-a-uuid/`; a valid-looking UUID absent from the API | Source traced; runtime responses and viewer decoding not run |
| Browse query | `studies?query=cell`; query text containing `&`, `+`, or Unicode; unknown facet | Request ownership traced; navigation and response assertions not run |
| Gallery/model | One accession/UUID/model actually supplied by each gallery; an unknown value | Source inventory only; fixture-backed cases remain to be selected |

The unknown values above are test inputs, not asserted API contracts. Determine missing-record behavior from the API and current application before specifying a desired status or error screen.

The subsequent [synthetic preservation characterization](scientific-preservation.md#missing-and-malformed-behavior) records an ungenerated Study's 404, absent Image UUIDs' inherited 500 defect and malformed URI encoding's 400 from the actual built Node server. It also supplies the deterministic Study/Image identifiers used for future semantic journeys. Netlify runtime and remaining gallery/Unicode cases are still unverified.

## Legacy redirects

[astro.config.mjs](../../astro.config.mjs) declares these 21 redirects. Destination existence and hosted response behavior need their own tests; several targets are not represented by a page file in this source inventory.

| Configured source | Configured destination |
| --- | --- |
| `/ai` | `/bioimage-archive/galleries/ai` |
| `/cryoet` | `/bioimage-archive/galleries/cryoet` |
| `/vem` | `/bioimage-archive/galleries/vem` |
| `/vis` | `/bioimage-archive/galleries/vis` |
| `/ai-glossary` | `/bioimage-archive/help/ai-glossary` |
| `/help-download` | `/bioimage-archive/help/downloading-data` |
| `/faq` | `/bioimage-archive/help/faq` |
| `/help-file-list` | `/bioimage-archive/help/file-list` |
| `/galleries-contribute` | `/bioimage-archive/help/galleries-contribute` |
| `/linking-archives` | `/bioimage-archive/help/linking-archives` |
| `/mifa-model-reference` | `/bioimage-archive/help/mifa-model-reference` |
| `/mifa-help-overview` | `/bioimage-archive/help/mifa-overview` |
| `/rembi-help-examples` | `/bioimage-archive/help/rembi-examples` |
| `/rembi-help-lab` | `/bioimage-archive/help/rembi-lab-guide` |
| `/rembi-model-reference` | `/bioimage-archive/help/rembi-model-reference` |
| `/rembi-help-overview` | `/bioimage-archive/help/rembi-overview` |
| `/help-search` | `/bioimage-archive/help/search` |
| `/submit-annotations` | `/bioimage-archive/help/submit-annotations` |
| `/help-tools` | `/bioimage-archive/help/supporting-tools` |
| `/helpimagesatebi` | `/bioimage-archive/policies/imagesatebi` |
| `/spora` | `/bioimage-archive/projects/spora` |

Netlify separately declares `/` → `/bioimage-archive` with status 301 in [netlify.toml](../../netlify.toml). The Node package build copies the root redirect HTML and robots file. Preserve both mechanisms until platform-specific tests explain their effects.

## Public configuration and deployment

All four fields below are declared public client strings in [astro.config.mjs](../../astro.config.mjs). The table records source defaults; it does not recommend endpoints for a deployment.

| Field | Source default | Existing consumer/interface |
| --- | --- | --- |
| `PUBLIC_SEARCH_API` | `https://alpha.bioimagearchive.org/search/v1` | Shared API helpers and search components; chart value `env.publicSearchApi` |
| `PUBLIC_MONGO_API` | `https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2` | Spatialomics file-reference generation; chart value `env.publicMongoApi` |
| `PUBLIC_GTAG` | Empty string | Layout analytics integration; chart value `env.publicGtag` |
| `PUBLIC_WEBSITE_STATE` | `DEV` | Header, landing pages, and site-state button; not injected by the inspected deployment template |

[The deployment template](../../helm-chart/templates/deployment.yaml) selects `ghcr.io/bioimage-archive/bia-astro:<image.tag>`, exposes container port 8080, and checks readiness at `/bioimage-archive/`. [The service template](../../helm-chart/templates/service.yaml) uses `service.type` and `service.port`. These are existing upstream deployment interfaces, not fork publishing destinations.

The only inherited [workflow](../../.github/workflows/basic_checks.yaml) runs on PRs targeting `main`, waits for the `bia-beta-website` Netlify preview, then runs a link-check container. It declares no explicit permissions or publishing step. It requires externally provisioned preview behavior; it has not been verified for this fork.
