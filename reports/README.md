# Engineering change reports

This fork records each new authored commit with a JSON source record and generated one-page LaTeX and PDF views in `commits/`. This is a fork contribution convention; upstream maintainers decide whether to retain it when accepting a proposal. Existing upstream history is outside this convention.

Reports contain public engineering context: the problem, change, rationale, affected paths, preserved behavior, risks, actual local checks, limitations, and rollback. Private planning references and backlog state are not report fields. Its parent SHA and payload fingerprint identify the tested candidate. The containing commit is found through its unique `Report-ID` trailer; a report cannot embed its own final commit SHA.

## Tools and prerequisites

Python 3.10 or newer and Git are required. Rendering additionally needs `pdflatex`, `pdfinfo`, and `pdftotext`, plus the TeX packages declared in [the template](templates/commit-report.tex). Install prerequisites explicitly before running checks. The Python tools use the standard library and are separate from the npm application.

Run from the repository root:

```sh
mkdir -p artifacts/tmp
TMPDIR="$PWD/artifacts/tmp" PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest discover -s tests/reports -v
python3 -B -m scripts.reports.candidate --report-id 20261001-193813-engineering-change-reporting
python3 -B -m scripts.reports validate path/to/record.json --require-commit
python3 -B -m scripts.reports build path/to/record.json --out artifacts/report-preview
```

The build command refuses to overwrite any existing triplet. Use a fresh output directory. Draft records and compiler intermediates belong under `artifacts/`; only the accepted JSON/TEX/PDF triplet belongs in `commits/`.

The Python validator is authoritative for structure. [The JSON schema](templates/report.schema.json) helps editors, but does not check every semantic constraint. Structural validation does not prove a claim was executed or verify candidate identity.

## Preparing a reported commit

1. Stage one coherent payload and inspect both staged and unstaged changes. Allocate a unique ID using its actual UTC preparation timestamp and durable purpose, for example `20261001-193813-engineering-change-reporting`.
2. Export the staged tree into an isolated directory under `artifacts/`. Execute the checks appropriate to that exact payload and record their commands, outcomes, durations, environment, and evidence locations.
3. Compute its fingerprint with `scripts.reports.candidate`. This excludes only the chosen report's exact JSON/TEX/PDF paths. Templates, tools, previous reports, file modes, and every other tracked path remain included. Root and merge commits and submodules require a separately agreed protocol.
4. Write the real record, render it, and inspect the PDF. Rendering rejects overflow, missing glyphs, multiple pages, and PDFs larger than 250 KiB. Generate twice in the same toolchain and compare the TEX/PDF bytes.
5. Stage the triplet. Recompute the fingerprint and confirm it matches the tested payload. Independently check the record's parent and fingerprint, the triplet, and the selected check results before committing.
6. Add exactly one trailer, such as `Report-ID: 20261001-193813-engineering-change-reporting`. Find the resulting commit with `git log --all --format='%h %s%n%(trailers:key=Report-ID,valueonly)'`.

The current tools calculate fingerprints and validate/render records. They do not install hooks, export candidates automatically, execute application gates, enforce report history, or configure GitHub protection. Those controls need separate tested changes. A JSON `PASS` is a claim supported by evidence, not a substitute for independent CI.

## Evidence and integration

Keep commands and outcomes literal. `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, and `NOT_APPLICABLE` have different meanings. A required failed or unexecuted check blocks admission. Remote checks are `NOT_RUN` at authoring and subsequently belong to the immutable commit's GitHub checks.

Rebasing changes parent-bound identity and requires regenerated reports and relevant validation. Agree the upstream integration strategy before rebasing or squashing reviewed history. Keep fork reporting machinery separate from application proposals so maintainers can review the useful change without adopting this convention.

For an explicitly authorized amendment of an unpublished commit, pass `--amend` to the candidate command. This uses the existing commit's parent. Export the corrected staged payload separately, run fresh relevant checks, and regenerate the triplet before `git commit --amend`. Normal candidates use the current HEAD as their parent. Never silently rewrite shared history.

PDF reproducibility is verified within the recorded toolchain; cross-platform byte identity is unproven. TeX runs without shell escape, which is not a complete sandbox. Compile untrusted contributions in an isolated environment without secrets. Do not include private data, credentials, or unsupported scientific glyphs in reports.

## UTC filenames and retained archives

New reports use `YYYYMMDD-HHMMSS-descriptive-purpose`. The eight-digit date and six-digit time are UTC, with real calendar values. The same stem names JSON, TEX, PDF and the `Report-ID` trailer. Its timestamp must equal `prepared_at_utc`, such as `2026-10-01T19:38:13Z` for `20261001-193813-engineering-change-reporting`. Sorting filenames therefore sorts preparation times. Keep the timestamp stable when regenerating an unchanged candidate. Choose another descriptive purpose or wait for another actual UTC second on a collision; never overwrite evidence or invent future preparation times.

The three earlier records retain their original bytes, internal IDs, preparation times and commit trailers. Only their archive filenames changed. [The explicit archive manifest](legacy-archive.json) maps each original trailer to its timestamped triplet, original commit and SHA-256 hashes. Resolve an old trailer with:

```sh
python3 -B -m scripts.reports.archive engineering-change-reporting-2026-10-01
```

Lookup checks the original commit tree and compares all archived bytes. Legacy IDs are accepted by fingerprinting only at their mapped historical commit, never for a fresh index or amendment. Validate and reproduce historical records with their original commit's tools and templates; today's authoring schema deliberately requires canonical IDs. Do not rewrite historical JSON or regenerate historical PDFs to give them new identities. A generated report-to-containing-commit index belongs under `artifacts/`.
