# Contributing to the BioImage Archive proposal fork

`bijux/bijux-bia-astro` is a fork of [BioImage-Archive/BIA-astro](https://github.com/BioImage-Archive/BIA-astro). It presents reviewable engineering proposals while preserving upstream ownership, scientific content, assets, URLs, and deployment interfaces. Fork names and contributor tooling do not change the public application name.

## Prepare a focused proposal

Inspect the current branch, remotes, and working tree before editing. Preserve other contributors' changes. Start a purpose-named topic branch from the confirmed upstream base, inspect current upstream pull requests for overlap, and record the exact base commit. Keep each commit coherent and independently reviewable.

Use the [declared developer toolchain](docs/engineering/development.md) and the checked-in npm lockfile for application setup:

```sh
node scripts/development/bootstrap.mjs doctor
node scripts/development/bootstrap.mjs install
npm run astro -- check
```

The production command remains `npm run build`; it checks the application, builds into `dist/bioimage-archive`, and copies the root redirect and robots assets. Static study and gallery generation uses configured external APIs. A type-check success does not establish a complete build, browser behavior, or real viewer operation. Run these commands in an isolated validation directory under `artifacts/` when collecting evidence.

See the [README](README.md) for development, preview, link checking, and the manual local OME-Zarr check. Preserve the existing Node/Netlify adapter selection, `/bioimage-archive` prefix, startup port, chart interfaces, and public configuration semantics unless the proposal deliberately changes one with evidence and maintainer review.

## Evidence and review

Each new authored fork commit includes its own [engineering change report](reports/README.md) and one `Report-ID` trailer. Record actual local results and limitations. Do not replace failed checks with claimed success, or assume a mock viewer proves image decoding. Independent CI and maintainer approval are separate evidence.

A useful review description explains the concrete problem, resulting behavior, preserved contracts, checks, report IDs, risks, and rollback. Show a before/after example for a behavior change. Keep repository-wide formatting, dependency changes, source moves, and deployment changes in separate proposals when they can be reviewed independently.

The fork's inherited website workflow waits for upstream Netlify previews. Its presence does not prove that fork CI works, and this fork has no verified Netlify connection. Do not trigger deployments or alter upstream settings as part of a local quality change.

## Upstream contribution

Review proposals with the team first. Upstream maintainers control licensing, contribution expectations, review, deployment, and merge strategy. Confirm those expectations before submission. No repository license has been declared in the inspected base; do not add one or claim broader reuse permission on behalf of upstream.

Submit focused application or documentation changes separately from fork-specific reporting conventions. Publishing a fork branch, opening an upstream PR, and deploying are explicit decisions; preparing a local commit does not imply any of them occurred.
