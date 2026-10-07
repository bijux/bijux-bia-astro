---
title: Source-audit findings and runtime contracts
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-07
last_reviewed: 2026-10-07
repository: BioImage-Archive/BIA-astro
scope: Verified source corrections and preserved runtime contracts from the dead-code audit
related_issue: BIOIM-347
related_issue_url: https://embl.atlassian.net/browse/BIOIM-347
---

# Source-audit findings and runtime contracts

[BIOIM-347](https://embl.atlassian.net/browse/BIOIM-347) applies the reviewed source corrections and removals identified using the audit tooling from [BIOIM-322](https://embl.atlassian.net/browse/BIOIM-322). This document records the source decisions and preserved runtime contracts.

The initial audit reported 80 candidates and 21 parser diagnostics. These counts describe analyzer observations, not 101 unused resources. Review the configured graph, source context and affected behavior before changing code. The audit commands and failure semantics are documented in [repository quality checks](quality.md).

## Verified corrections

The source corrections balance mismatched layout/HTML closing tags, complete type-only frontmatter delimiters and remove stray attribute punctuation. They preserve route exports, scripts, content expressions and valid adjacent Astro conditional siblings. Astro accepted the original files, so parser diagnostics alone did not establish deployed failures. Correcting the source allows the analyzer to inspect previously skipped code and can increase the candidate count.

Unused local tuple elements use destructuring elisions so the second element stays in its original position. The spatialomics file table still initializes DataTables and attaches copy handlers; only its unused return handle and trailing callback argument are removed. Bare DataTables imports preserve module initialization. Removing a local asset import does not remove the asset itself.

Six functions in `SharedJSFunctions.js` have callers within that module. Their implementations remain, with unnecessary exports removed. Only helpers with no active caller are removed. The CC0 licence-logo branch returns the same concatenated URL without assigning it back to an unread local.

The benchmarking biological-entity helpers formerly assigned an empty fallback and then unconditionally called `flatMap` on the original value. The pure helpers in `components/ai-benchmarking/biological-entities.js` normalize missing/non-array collections, preserve valid object identity, ordering and authored descriptions, and omit null/non-object taxon entries before rendering. Metadata regression tests cover these contracts.

The volume-EM view switch requires access to the initialized table instance. The table handle therefore belongs to the script scope shared by the load callback and view-switch function. A handle scoped only inside the callback cannot serve the switch; removing initialization would also break the table. Gallery regression tests exercise the script's load callback, table/card/grid switches and grid-density behavior.

Remove local CSS selectors only after checking their owning markup, client scripts and generated/child content. When one selector in a shared rule is unused, retain the other selectors and declarations. Static source searches and browser comparisons cover the reviewed selectors; they do not prove all future render states.

## Optional browser controls and dependency order

The viewable-image component renders either a table or an explanatory message. Its processed browser script is still included when the table is absent, so initialization must check for the table before reading its dataset or registering table handlers. When the table exists, the same API requests, image destinations, pagination and state handlers remain active.

The general image page renders the OME-Zarr copy button only when an interactive representation is available. Its script must likewise check for the button before reading its label or attaching the clipboard handler. The normal copy behavior and label restoration remain unchanged.

The Base, EMPIAR and Projects layouts load jQuery before their dependent DataTables 2.1.8 CDN script. Both use [`is:inline`](https://docs.astro.build/en/guides/client-side-scripts/#unprocessed-scripts) to preserve ordinary blocking script tags instead of Astro's module-import processing. Source order alone does not establish execution order for processed scripts. This corrects the previously reproduced `jQuery is not defined` error without changing library versions. Network availability and the volume-EM page's additional legacy CDN scripts remain separate integration concerns.

`npm run test:browser` exercises the actual scripts with absent/present elements, a table API response, clipboard behavior and layout script order. These tests run through `make quality-test`; compiled-browser checks complement the controlled script tests.

## Unreachable components and ineffective styles

Remove `AnnotationFilesTable`, `DatasetFilesTable`, `ImageTableRow`, `ModelFieldInfoTable`, `Article`, `SourceImage` and `MarkdownLayout` after checking the complete tracked repository for consumers, configured graph entries, Markdown layouts and dynamic imports. `Article` had only `ModelFieldInfoTable` as a caller, and both were unreachable. `SourceImage` appeared only in a commented proposal; the source-image linking TODO remains without referencing a removed component. No active route or content layout used these files. Public assets and live file-table components remain.

CaseStudy's `img :global(img)` required an image inside another image, while its `svg` selector had no rendered consumer. Remove these ineffective selectors rather than inventing a new image styling requirement. Compiled case-study image styles are compared before and after the removal.

## Contracts retained during review

| Observation | Why the code remains |
| --- | --- |
| DataTables render placeholders, event settings, `Array.from` values and regex full matches | Earlier parameters reserve the positions of later used callback arguments. Deleting them changes the received data. |
| `StudyTitleInfo` `.highlight` | Client code adds and removes the class on authors and affiliations for click/hover feedback. |
| `ViewableImageTable` `.file-path` | Browser code creates the spans and measures their widths. |
| Table-cell and volume-EM child selectors | Child components generate the matching elements; a local-template warning does not establish absence from the rendered DOM. |
| Collapsed image-metadata selector | Browser code toggles the `data-collapsed` attribute to control the metadata view. |
| Volume-EM `copyURI` | Child-card inline handlers call the browser-global function. |
| jQuery and DataTables type dependencies | Runtime table integrations and automatically loaded ambient browser types need a separate dependency review. |
| Announcement collection loading | The result is unused by active markup, but the awaited content operation remains; deciding to retire the feature is separate work. |
| `buildDatasetFileSummary` | Its only study-page call is currently commented out. Removing the unused import exposes the helper as a new candidate; retiring that feature and its related XML helpers is a separate decision. |

The dependency lockfile, audit rules, runtime entry-point configuration and CI policy are unchanged by these application corrections. Remaining candidates stay visible. A completed configured scan is narrower than complete runtime coverage; `make quality` can still fail because candidates remain, while report-only mode succeeds when analysis itself completes.

## Build and browser comparison limits

The unchanged home-news and case-study components iterate unsorted content collections. Independent before/after builds produced the same entries in different positions. Retain the ordered snapshot differences and compare content identities and case-study image styles separately; do not attribute collection ordering to selector or component removal. Home-news date ordering belongs to BIOIM-266. No additional collection-ordering policy is introduced here.

DOM references justify preserving child/dynamic style intent, but do not establish that every scoped selector applies in every browser state. Compiled before/after checks cover file-view switching, image-table pagination, spatialomics dataset selection and file-copy URI/label behavior with real API responses and a stubbed clipboard writer. External viewers, network failures and the additional legacy volume-EM CDN integration remain outside this verification.
