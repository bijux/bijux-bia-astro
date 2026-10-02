# Observed BioImage Archive application baseline

On 1 October 2026, the untouched application at `808857d90a142ab0dc10c873ec44a2e24a344a76` passed a locked install, Astro check, Node production build, Netlify adapter compilation, and three built HTTP page checks. These observations establish a starting point for preservation work. They do not establish complete application coverage, security, browser interaction, or deployed-platform readiness.

## Source and environment

The fork is [bijux/bijux-bia-astro](https://github.com/bijux/bijux-bia-astro), and the upstream is [BioImage-Archive/BIA-astro](https://github.com/BioImage-Archive/BIA-astro). Both inspected `main` branches matched the baseline above. The initial local worktree was clean.

| Input | Observed value |
| --- | --- |
| Git tree | `bd4d8e83d1e036931d9efeb1aad943637e47b4d3` |
| Lock SHA-256 | `3ceffd7c22b933169921803e46d8d25f00a523c722e32f73d8af8e65ef0ea5b1` |
| Tracked files | 574, including hidden configuration/workflow files |
| Node / npm | 24.3.0 / 11.4.2 |
| Astro / TypeScript | 5.13.2 / 5.9.2, resolved from the lock |
| Node / Netlify adapter | 9.4.2 / 6.5.7, resolved from the lock |
| Report tool environment | Python 3.14.4, TeX Live 2024, Poppler 26.09.0 |

These are observed versions, not a maintained-runtime recommendation or a proven deployment pin. Application source and the lock were exported into separate `artifacts/baseline/node` and `artifacts/baseline/netlify` validation directories. Dependencies were installed from the lock; the two builds had separate outputs. TeX intermediates, caches, logs, and draft records stayed under `artifacts/`.

## Executed checks

| Command or probe | Result | Observed duration | Qualification |
| --- | --- | --- | --- |
| `npm ci` | PASS | 13.433 s | Lock unchanged; install also reported inherited dependency advisories |
| `npm run astro -- check` | PASS | 7.041 s | 113 files; zero errors, zero warnings, 185 hints |
| `npm run build` | PASS | 279.069 s | Node selectors cleared; source API defaults; live API-dependent generation |
| `NETLIFY=true npm run astro -- build` | PASS | 298.410 s | Separate workspace; generated redirects and SSR function; no deployment |
| Node root assets and entry point | PASS | Not timed separately | Root copies matched source; Node entry present; 2,021 static HTML outputs in this dataset |
| Built Node HTTP smoke | PASS | 0.238 s | Loopback host and an ephemeral port; home, FAQ, and Study HTML returned HTTP 200 with titles |
| Hidden/Unicode/dirty inventory probe | PASS | Not timed separately | Disposable repository; hidden workflow, spaced Unicode path, dirty and untracked files found without modifying file bytes |

The Study smoke case was `/bioimage-archive/study/S-BIAD2258/`. The server was stopped after the checks. No browser or viewer-decoding result is inferred from HTML responses.

Full public-safe local evidence is in `artifacts/baseline/record.json`, `tracked-files.txt`, `install.log`, `check.log`, `build-node.log`, `build-netlify.log`, `node-smoke.json`, and `npm-audit.json`. These generated files are not tracked source. Replaying a live-service build can produce a different dataset or duration; deterministic fixture builds remain to be implemented.

## Findings requiring separate work

The install/audit reported 41 dependency advisories: one low, seven moderate, 31 high, and two critical. The critical package entries were Astro and transitive `tar`. The relevant upstream advisories describe [untrusted AVIF optimization in Astro](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2) and [unbounded archive input in node-tar](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw). Reachability in this frontend has not been established. Do not interpret build success as security clearance or apply forced dependency remediation without compatibility evidence.

The full tracked tree exposed an existing Netlify-dependent link-check workflow and a documented manual local viewer check. No application test files or named test/lint scripts were found at this baseline. The fork's reporting regression suite covers report tools, not application behavior.

No repository license or contribution policy was declared at the inspected baseline, and GitHub returned no detected license. Licensing and submission expectations need maintainer clarification. Existing attribution, scientific content, and upstream ownership remain preserved.

The existing Docker context includes developer files. Report files are outside application routes, but exclusion from container artifacts has not been verified. The moving container base, unlocked install, startup build, hosted Node version, chart deployment, configuration timing, and actual fork check/protection settings remain separate concerns.

## Acceptance limits

No remote fork CI, branch protection, upstream approval, Docker/Helm smoke, Netlify runtime, keyboard/accessibility review, or local OME-Zarr decoding was performed. No application source relocation, package rename, framework/library replacement, dependency refresh, deployment, or upstream PR was included in this baseline work.
