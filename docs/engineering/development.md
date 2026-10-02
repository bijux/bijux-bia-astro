# Reproducible developer setup

The developer version declaration is [configs/development/toolchain.json](../../configs/development/toolchain.json). It selects the maintained [Node 24.21.0 LTS release](https://nodejs.org/en/blog/release/v24.21.0) and its bundled npm 11.19.0. Use one npm lockfile and a locked install.

Install that exact Node distribution using your existing version manager or an official Node binary. Put its `bin` directory first on `PATH`. The repository does not install a version manager or silently provision a runtime.

```sh
node scripts/development/bootstrap.mjs doctor
node scripts/development/bootstrap.mjs install
npm run astro -- check
npm run dev
```

`doctor` prints only observed and required Node/npm versions. It diagnoses missing npm or a mismatch without installing, deleting, or fetching APIs. `install` requires an exact match, then delegates to `npm ci`, preserving a nonzero child exit code. Its npm cache is under `artifacts/npm-cache`. A package/lock mismatch must fail rather than refresh the lock.

This declaration governs the explicit developer bootstrap. It is separate from deployment runtime selection: [Netlify gives `.nvmrc` and `.node-version` precedence over site settings](https://docs.netlify.com/build/configure-builds/available-software-at-build-time/), and this proposal does not add either file or change package engines, container startup, adapters, or hosted settings. Netlify and container runtime decisions still need platform evidence and maintainer review.

The bootstrap uses a POSIX `npm` executable. Validation is on macOS arm64; Linux and Windows execution have not been established. The declared version is a reproducible input, not a permanent security recommendation. Revisit it deliberately when the supported LTS patch changes, replay the lock and affected builds, and record the evidence.

Run its focused regression checks with:

```sh
node --test tests/development/bootstrap.test.mjs
```

The suite covers diagnostic side effects, missing tools, version mismatches, malformed declarations, and child failure propagation. It does not establish browser behavior or deployment readiness.

## Command entry points

Npm owns command behavior; the Makefile delegates to the same commands. `make` or `make help` prints help without inspecting services or installing anything. `make doctor` checks the declared developer versions without printing configuration values; it fails on a mismatch. Select the declared distribution on PATH explicitly before running `make install` (guarded `npm ci`).

`make dev`, `make build`, `make preview` and `make check` call the existing Astro interfaces. The production build retains its type check and root robots/redirect copies. `npm run local` and `npm run prod` retain their original behavior. `make test` exercises the developer commands; `make report-test` runs the report suite and fails on empty collection. These tests do not establish application browser or viewer correctness.

Typechecking excludes saved source probes and validation snapshots under `artifacts/`, while retaining Astro's inherited `dist` exclusion. Application source remains checked: invalid source outside those run-output directories still fails the original check command. Keep generated run products under `artifacts/` rather than beside application files. Independent adapter builds also use separate clean snapshots, so a retained inspection file cannot become a build input.

```sh
make report-check RECORD=artifacts/change-record.json
make report RECORD=artifacts/change-record.json OUT=artifacts/report-preview
```

`make clean` deletes only generated `dist/`, `.astro/` and `.netlify/` directories after confirming that none contains tracked files or is a symlink. It preserves `artifacts/`, source, dependencies, environment files and arbitrary user files. Every target propagates its child's failure. Browser, link, deployment and admission commands will be documented only when their implementations are available.

## Testing staged bytes

Export the exact staged tree, preserving unstaged edits:

```sh
npm run candidate -- --report-id 20261001-193813-engineering-change-reporting --out artifacts/staged-review
```

Use a newly allocated canonical report ID for a real change and a fresh output directory. Export rejects conflicts, submodules, case collisions and symlinks that escape the snapshot. It preserves staged additions, deletions, renames, executable modes and internal symlinks. `artifacts/staged-review/candidate/` contains the staged files and local Git ancestry; `frozen.json` binds the parent and tree. Run checks inside that snapshot. Unstaged passing code cannot replace staged failing code. `make verification-test` exercises these boundaries; it does not run application journeys.
