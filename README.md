# BioImage Archive website

Astro application served under `/bioimage-archive/`. Study pages are prerendered;
search and image pages also use their configured APIs at runtime.

Use Node 22.22 or newer and run commands from the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:4321/bioimage-archive/`. Dependencies, build output and caches
live under `artifacts/`; root `node_modules`, `.astro` and `.netlify` are tool entry links.

Before submitting changes:

```sh
PLAYWRIGHT_BROWSERS_PATH=artifacts/browsers npx playwright install --only-shell chromium
make verify
```

This runs source checks, all Node tests and deterministic production-browser checks.
Live catalogue verification and static audit inventories run separately.

To build and serve a verified Node deployment:

```sh
npm run build:deployment
DEPLOYMENT_MANIFEST=artifacts/deployment/manifest.json npm run prod
```

The build needs catalogue APIs unless replaying a captured snapshot. Serving an
existing verified deployment does not rebuild it.

- [Architecture](docs/development/architecture.md): ownership and preserved contracts.
- [Verification](docs/verification.md): local/CI checks, audits and evidence.
- [Deployment](docs/deployment.md): snapshots, public configuration, containers and Helm.
- [Security](docs/development/security.md): application boundaries and remaining risks.
