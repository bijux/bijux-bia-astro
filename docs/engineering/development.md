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
