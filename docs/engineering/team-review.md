# BioImage Archive fork proposal for team review

`bijux-bia-astro` is Bijux's proposal fork of the BioImage Archive frontend. Its purpose is to make engineering changes understandable, reproducible, and easy for the team to review before submitting focused contributions upstream. BioImage Archive remains the product identity and upstream remains the owning project.

## What the team can inspect now

The fork retains GitHub's parent relationship and the complete upstream history. Its initial application baseline is `808857d90a142ab0dc10c873ec44a2e24a344a76`. The [architecture map](../architecture.md) explains the actual build/server/browser boundaries and the behaviors to preserve.

[The observed baseline](baseline.md) records successful locked installation, Astro checking, both adapter builds, and three built HTTP checks. It also records inherited advisories and the limits of those checks. These are measured outcomes, not a claim that every user journey works.

The first authored change adds [contributor guidance](../../CONTRIBUTING.md) and [engineering change reports](../../reports/README.md). Each report gives a problem, scope, rationale, preserved behavior, actual checks, risks, and rollback, tied to its parent and payload fingerprint. Inspect [the real report-tools PDF](../../reports/commits/engineering-change-reporting-2026-10-01.pdf) and find its commit through the `Report-ID` trailer.

## Suggested presentation

1. Show the fork relationship and explain why the repository has a distinct name while the scientific application identity is preserved.
2. Trace the Study hero to Image route and viewer boundary in the architecture diagram. Explain why browser-only mocks cannot validate all API calls.
3. Show baseline build and HTTP results alongside unverified browser, viewer, security, and platform behavior.
4. Open a real one-page commit report and the corresponding diff. Demonstrate what changed, what stayed identical, and how evidence is tied to the candidate.
5. Agree a small next contribution: reproducible development inputs and deterministic preservation tests before demonstrated behavior repairs.

## Decisions for maintainers

Confirm the intended runtime/deployment constraints, contribution/licensing expectations, and the useful proposal to prioritize. Decide whether reports remain fork-only and how accepted changes should be rebased or squashed without misrepresenting the original evidence. Coordinate gallery, annotation, download, and client-library work with current upstream proposals.

The reporting workflow is a proposal convention for this fork. It does not require the upstream team to adopt Python/TeX tooling or a new merge policy. Source changes, CI, dependency remediation, and deployment changes should be independently reviewable.

Local commits can be reviewed before publishing a branch. No push, upstream PR, deployment, or team approval is asserted by this presentation.
