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
| Case-study image styles | The selector appears ineffective, but its intended relationship to Astro's Image output needs a separate styling correction. |
| Announcement collection loading | The result is unused by active markup, but the awaited content operation remains; deciding to retire the feature is separate work. |
| Unreachable components/layout and their local findings | An import-graph candidate is reviewed as a whole-file decision, including runtime and dynamic references, rather than partially rewriting unused components. |
| `buildDatasetFileSummary` | Its only study-page call is currently commented out. Removing the unused import exposes the helper as a new candidate; retiring that feature and its related XML helpers is a separate decision. |

The dependency lockfile, audit rules, runtime entry-point configuration and CI policy are unchanged by these application corrections. Remaining candidates stay visible. A completed configured scan is narrower than complete runtime coverage; `make quality` can still fail because candidates remain, while report-only mode succeeds when analysis itself completes.
