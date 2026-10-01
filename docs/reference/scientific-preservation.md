# Scientific identifiers, relationships and missing data

This contract comes from the application consumers at baseline `808857d90a142ab0dc10c873ec44a2e24a344a76`. The [synthetic HTTP catalogue](../../tests/fixtures/catalog.mjs) supplies invented values to those consumers. It is neither a description of a real submission nor a guarantee of live API compatibility. The application source remains unchanged while these expectations are established.

## Concrete data expectations

The representative accession is `S-BIAD90001`. Its image UUID is `a6ecc705-7de4-406b-80f9-bd76322465e3`; its dataset UUID is `synthetic-dataset-S-BIAD90001`. The synthetic Study contains one dataset and one image. Expected values below follow the actual field selection and formatting code, rather than guessed API names.

| Invariant and expected value | Consumer/source | Risk and review responsibility | Planned validation |
| --- | --- | --- | --- |
| Study title and accession remain `Synthetic fixture study S-BIAD90001` and `S-BIAD90001` | [Study route](../../src/pages/study/[accessionID].astro), [title](../../src/components/study-page/StudyTitleInfo.astro) | Wrong scientific identity; data/frontend maintainer | Built Study heading and title assertions |
| Headline values are one viewable image, two files and `2.05 kB`, from dataset `image_count`, `file_reference_count` and `file_reference_size_bytes=2048` | Study `headlineStats`; [shared byte formatter](../../src/components/SharedJSFunctions.js) uses base 1000 and two decimal places | Invented counts or unit drift; data/frontend maintainer | Built summary assertions, including absent/zero cases separately |
| Study hero URI equals the image's `image_static_display_uri.value.slice.uri`; its link is `/bioimage-archive/image/a6ecc705-7de4-406b-80f9-bd76322465e3` | Study `getImageUUIDFromStudyImage` | A matching thumbnail links to another image; frontend maintainer | Assert exact matching URI and destination, then follow the link |
| Image `submission_dataset_uuid` matches the Study dataset UUID; Image links back to `/bioimage-archive/study/S-BIAD90001` | [Image route](../../src/pages/image/[uuid].astro), `imageDataset` selection | Cross-study or dataset mismatch; data/frontend maintainer | Built Image title, dataset and return-link assertions |
| Pixel size is `2 x 2 px`; channels and timesteps are each one. The singleton Z axis is omitted | Shared `formatPixelDimensions`; Image route | Axis/count conflation; viewer/data maintainer | Production formatter and visible metadata assertions |
| Physical image size is `0.0000020 x 0.0000020 m`; voxel size is `0.0000010 x 0.0000010 m/pixel`. Null Z contributes no dimension | Shared `formatPhysicalDimensions` and `formatPhysicalVoxelDimensions` | Metres, pixels or missing axes misrepresented; viewer/data maintainer | Exact formatter/output assertions and null/unknown cases |
| Representation fallback selects `.ome.zarr` and its first `file_uri`. The synthetic source is the fixture origin plus `/synthetic.ome.zarr` | Image representation selection; shared `buildVizarrViewerURL` | Wrong representation or corrupted query encoding; viewer maintainer | Parse iframe URL and compare decoded `source` exactly; decoding is a separate real-data check |
| Known `livingobjects-int.ebi.ac.uk` visualization sources become `livingobjects.ebi.ac.uk`; other valid hosts retain their identity | Shared `getPublicVisualisationURI` | Broken internal/public storage mapping; viewer maintainer | Production helper assertions with reserved characters |
| File path remains `synthetic slice & µ.tiff`; total bytes are 2048 | Image route and [image table](../../src/components/image/ImageTable.astro) | Lost Unicode, unsafe markup or changed download destination; data/frontend maintainer | Visible text, escaped markup and exact destination assertions |
| Licence URI is the CC0 URI while the label remains `Synthetic fixture only`; citation names `Synthetic Fixture Author`, release year 2026 and the same accession | Study/Image routes and [citation](../../src/components/Citation.astro) | Lost attribution or synthetic data presented as real; content/data maintainer | Visible licence/citation assertions and responsible human review for real content changes |
| Browse total is two for the primary records; page size one yields one hit per page with total pages two | Shared pagination helpers; [Search.astro](../../src/components/search/Search.astro) | Truncated records or duplicated pages; API/frontend maintainer | Actual HTTP pagination, followed by built search/navigation tests |
| API accessions absent from the catalogue return empty hits, independently of malformed JSON, HTTP 503 and delayed responses | [fixture service](../../tests/fixtures/server.mjs); shared `getFromAPI` and lookup helpers | Conflating unavailable data, absence and a genuine zero; API/frontend maintainer | Boundary tests plus explicit application failure characterization |

The responsibilities above identify review roles to confirm, not assigned reviewers or claimed approval. The URI includes an ephemeral local fixture port; compare against the service's declared origin rather than embedding a guessed fixed port. A loaded viewer frame with this synthetic source does not prove image decoding.

## Missing and malformed behavior

The source's Study totals use `sum || 0`, so an invalid or missing count can collapse to zero. This is an inherited risk to characterize and repair in a separately validated change; zero is not a scientific substitute for unknown. Physical dimension helpers return `Unknown` when no non-null, non-singleton physical dimensions remain. The pixel helper omits null and singleton axes and appends ` px`; an all-absent case must be characterized rather than assumed to say `Unknown`.

`getFromAPI` catches fetch/JSON exceptions and returns null; it does not check `response.ok`. Study lookup returns undefined for no matching accession, while Image lookup returns null for no hit. The standard Image route then dereferences `image.representation` without guarding null. Other gallery consumers need separate observations.

On 1 October 2026, the real built Node entrypoint against the synthetic service returned:

| Input | Observed response | Interpretation |
| --- | --- | --- |
| `/bioimage-archive/study/UNKNOWN-ACCESSION/` | 404 | Static Study accession was not generated |
| `/bioimage-archive/image/not-a-uuid/` | 500 | Inherited missing-image dereference; a defect, not the desired contract |
| `/bioimage-archive/image/00000000-0000-4000-8000-000000000000/` | 500 | Valid-looking UUID absent from the service has the same defect |
| `/bioimage-archive/image/%ZZ/` | 400 | Node adapter rejects malformed URI encoding |

These observations are qualified to the Node build and exact synthetic input. They do not establish Netlify runtime, all Unicode/reserved identifiers, live API behavior or an approved error-page design. Evidence is retained in `artifacts/admission/20261001-212417-deterministic-http-fixtures/missing-route-characterization.json` and its bounded runtime log.

An incorrect future result such as accession `S-BIAD90002` on the representative Study, a headline count of two images, a hero link to a different UUID, or a viewer source that loses `&` must fail the corresponding assertions. Missing numeric metadata becoming a fabricated zero also needs its own negative control, rather than blessing the inherited fallback.

The [route/configuration reference](routes-and-configuration.md) covers base/root resources, every source route and redirect, public defaults, ports and chart interfaces. The [architecture preservation matrix](../architecture.md#preservation-and-test-priorities) supplies the remaining surface risks and review roles. Neither document labels unexecuted checks as passing.
