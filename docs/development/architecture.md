# Application boundaries

`src/pages` preserves public routes and composes feature-owned presentation in
`src/features`. Shared UI/navigation lives in `src/components`; document ownership
stays in `src/layouts`. Feature-specific styles stay with their owner.

`src/api` owns external requests and response contracts. Pure formatting lives in
`src/formatting`; security policy stays in `src/security`. API clients do not import
presentation, and shared UI does not import features. The architecture tests check
runtime import resolution, cycles and direct server dependencies in browser graphs.

`npm test` runs every Node unit/functional suite in `tests/unit` and
`tests/functional`. Production browser journeys live in `tests/e2e` and run through
`npm run test:e2e`. The fixture application builds
once before its server starts; browser cases use isolated storage.

Captured API responses and their provenance stay unchanged in `tests/fixtures/api`.
Synthetic cases are explicit in `tests/fixtures/scenarios`. Unexpected API requests
fail. Browser checks exclude external viewers/chrome, images, fonts and analytics;
they verify application behaviour and destinations, not those services.

Builds, caches, browser traces and reports go under `artifacts/`. CLI ownership
stays in `scripts/build`, `catalogue`, `deployment`, `verification` and the audit
directories. `makes/*.mk` is included by the root Makefile.
