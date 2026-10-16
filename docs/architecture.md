# Application ownership

| Boundary | Owns |
| --- | --- |
| `src/pages` | Public routes, loading and page composition |
| `src/layouts` | Documents, shared head/footer and layout structure |
| `src/components` | Reusable UI and navigation independent of features |
| `src/features` | Domain presentation, selectors, browser controls and owned styles/data |
| `src/api` | Request transport, endpoint clients and response contracts |
| `src/formatting`, `src/security` | Shared pure formatting and security policies |
| `src/server`, `src/observability` | Serving, runtime configuration and correlated events |
| `src/content`, `src/assets`, `public` | Editorial content, processed imports and stable public resources |

Search groups facets, pagination/history and result rendering by capability.
Metadata owns field labels, biological records, ontology/taxon rendering and count
validation. Keep domain-specific formatters with their feature; shared ones
belong in `src/formatting`. Small cohesive areas remain shallow.

API modules do not import presentation. Shared UI does not import features.
Feature presentation receives loaded data; browser graphs cannot reach server-only
modules. `npm test` checks import resolution, runtime cycles and selected ownership
rules. Move consumers and analyser entries together; remove unused bridges.

## Preserved contracts

- Route sources and public asset URLs are interfaces. Reorganisation must retain
  destinations and supported behaviour.
- Metadata retains supplied values, ordering, links, zero/false and disclosure
  defaults. Native disclosures are independent; initially repeated records retain
  **(as above)**. Rendering does not mutate API objects.
- FBBI syntax permits an OLS search, not proof of ontology membership. Keep IDs
  separate from method-name arrays; preserve order, duplicates and unsupported text.
- Rectangular actions adopt `bia-button`; generated pagination uses
  `bia-table-controls`. These hooks own geometry. Informational panels, switches,
  focus, colours and selected/disabled feedback retain their own styling.
- Keep native links for navigation and buttons for commands. Preserve annotation
  hooks, unique repeated-pane IDs and original viewer/copy destinations.

Tests are grouped first by execution boundary (`unit`, `functional`, `e2e`), then
owner. Captured APIs and provenance live in `tests/fixtures/api`; synthetic cases
are explicit. Shared builders/servers live in `tests/support`. Generated evidence
stays under `artifacts/`. See [verification](verification.md) for commands and limits.
