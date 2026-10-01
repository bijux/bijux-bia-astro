# Retained report history and fork integration

The fork integrates reported topic histories with GitHub merge commits. Squash and server-side rebase change parent-bound identities and are not compatible with this retained-history protocol. Upstream maintainers decide their own integration and report-retention policy; this convention does not impose fork settings on them.

## Authored commits

Every authored change has exactly one `Report-ID` trailer and its original JSON/TEX/PDF triplet in that same commit. The parent and payload fingerprint must match that original tree. The [archive mapping](../../reports/legacy-archive.json) permits only its three exact earlier commits to retain legacy IDs. Historical evidence is never validated against the latest template or silently relabelled.

Run original-report verification over the complete proposed authored range:

```sh
python3 -B -m scripts.reports.history --base <verified-base-sha> \
  --head <topic-head-sha> --out artifacts/history/<purpose>
```

The tool rejects shallow/ambiguous ancestry, missing triplets, duplicate identities, wrong parents and stale payloads. It exports each commit's original rendering tools/templates into separate artifact directories and regenerates its record. JSON and TeX must match exactly; tracked PDF content and one-page/size structure must match the regeneration. Add `--byte-identical` for the recorded same-toolchain byte comparison. Cross-platform PDF byte identity remains unproven. Rendering historical contributor code/TeX requires a secret-free disposable environment.

This command verifies report identity and rendering. It does not turn recorded `PASS` strings into independently executed tests. Applicable epoch tests, exact-head checks, integration checks and actual required reviews remain separate requirements. Early commits retain their original adoption checks; absent later controls are never reported as passing. A range starts at an independently verified base; generated integration nodes are checked through the separate protocol below.

## Generated integration nodes

A GitHub-generated merge node has no authored same-commit report. Its evidence is the checked base/head pair, actual GitHub PR provenance, independent check runs and their checkout identities. This is a narrow allowance for a generated topology node, not permission to introduce unreported source or conflict resolutions.

Before merging, freeze the fork PR's full base/head SHAs and fetch its synthetic merge ref. Require exactly those two parents and the tree produced by `git merge-tree --write-tree <base> <head>`. A conflict rejects automatic integration. Any necessary source resolution belongs in an ordinary admitted, reported topic commit. Both exact head and synthetic integration need independent completed checks; pending, missing, failed, cancelled and unexpected skips do not pass. Confirm existing required reviews/protections through GitHub; no local declaration can replace them.

Use the head guard when merging the authorized fork PR:

```sh
gh pr merge <number> --repo bijux/bijux-bia-astro --merge \
  --match-head-commit <checked-topic-head-sha>
```

Immediately before that command, refresh the base and PR state as well. If either input changed, invalidate the affected evidence. Do not use administrative bypass or substitute a squash/rebase merge. The merge request is only an action checkpoint: verify actual merged state and fresh default-branch history afterward.

After a fresh fetch, validate the actual node:

```sh
python3 -B -m scripts.reports.integration --repository bijux/bijux-bia-astro \
  --pr <number> --base <checked-base-sha> --head <checked-head-sha> \
  --checks artifacts/integration/<purpose>/checks.json
```

The validator fetches live PR provenance. It requires a completed merge into this fork's `main`, the retained original head, exact parent order, matching PR subject and the expected automatic tree. It rejects a generated node that masquerades as an authored `Report-ID`. The supplied check index must name both head and integration SHA/tree inputs and actual Actions run IDs/URLs. The command independently retrieves each run's live status and jobs, then downloads its checkout-identity artifact and compares that identity with Git objects. A caller's claimed success cannot override a failed or missing live job.

The bootstrap check contract uses `.github/workflows/bootstrap_admission.yaml`, completed jobs named `Bootstrap verification` and `Bootstrap result`, and an artifact `bootstrap-identity-<candidate-sha>` containing `candidate.json`. Those are implementation interfaces, not an assertion that checks have already run. Each identity contains the actual checked-out `candidate_sha`, `tree_sha` and ordered `parents`. A head run uses the push event; the integration run uses the PR event and actual synthetic checkout. Broader CI controls can extend this contract in a separately verified change.

Keep generated check indexes, run receipts and report-to-commit mappings under `artifacts/`; confirm the actual merged node is reachable from freshly fetched fork `main`. Retain authored originals and record GitHub's merge SHA externally. A later authored commit can legitimately have a verified integration node as its parent; the generated node does not change the original reports' recorded parents. Before starting another contribution slice, verify the preceding fork integration completely.
