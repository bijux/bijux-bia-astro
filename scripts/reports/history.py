"""Bind every authored report to its original commit and original rendering tools."""

import argparse
import json
import os
import re
import subprocess
import unicodedata
from pathlib import Path

from .candidate import fingerprint, git
from .identity import legacy_archives
from .integration import commit
from .record import validate


def report_identity(repo, sha):
    sha = commit(repo, sha)
    parents = git(repo, "rev-list", "--parents", "-n", "1", sha).decode().split()[1:]
    if len(parents) != 1:
        raise ValueError("Authored history must have exactly one parent; generated integrations use the provenance protocol.")
    message = git(repo, "show", "-s", "--format=%B", sha)
    trailers = subprocess.run(["git", "interpret-trailers", "--parse"], input=message, capture_output=True, check=True).stdout.decode().splitlines()
    ids = [line.split(":", 1)[1].strip() for line in trailers if line.split(":", 1)[0].lower() == "report-id"]
    if len(ids) != 1:
        raise ValueError("Each authored commit requires exactly one Report-ID trailer.")
    report_id = ids[0]
    legacy = legacy_archives(repo).get(report_id)
    if legacy and legacy["commit_sha"] != sha:
        raise ValueError("Legacy report belongs to another original commit.")
    names = [f"reports/commits/{report_id}.{ext}" for ext in ("json", "tex", "pdf")]
    for name in names:
        entry = git(repo, "ls-tree", sha, "--", name).decode()
        if not entry.startswith("100644 blob "):
            raise ValueError("Original report triplet is missing or not regular nonexecutable files.")
    data = json.loads(git(repo, "show", f"{sha}:{names[0]}"))
    validate(dict(data, report_id=legacy["archive_stem"]) if legacy else data, require_commit=True)
    if data["report_id"] != report_id:
        raise ValueError("Original trailer and record identity differ.")
    identity = fingerprint(repo, report_id, sha)
    if data["parent_sha"] != parents[0] or data["candidate_sha256"] != identity["candidate_sha256"]:
        raise ValueError("Original report parent or payload differs from its containing commit.")
    return {"commit_sha": sha, "report_id": report_id, "parent_sha": parents[0], "candidate_sha256": identity["candidate_sha256"]}


def historical_tools(repo, sha, destination):
    if destination.exists() or destination.is_symlink():
        raise ValueError("History output already exists.")
    entries = []
    for raw in git(repo, "ls-tree", "-r", "-z", sha, "--", "scripts/reports", "reports/templates").split(b"\0"):
        if not raw:
            continue
        header, name = raw.split(b"\t", 1)
        mode, kind, oid = header.decode().split()
        path = Path(os.fsdecode(name))
        if mode not in ("100644", "100755") or kind != "blob" or path.is_absolute() or any(part in ("..", ".git") for part in path.parts):
            raise ValueError("Historical rendering tools have unsupported paths or objects.")
        entries.append((path, git(repo, "cat-file", "blob", oid)))
    destination.mkdir(parents=True)
    for path, content in entries:
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)


def pdf_text(path):
    value = subprocess.run(["pdftotext", str(path), "-"], capture_output=True, check=True, text=True, timeout=10).stdout
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def reproduce(repo, identity, output, byte_identical=False):
    sha, report_id = identity["commit_sha"], identity["report_id"]
    snapshot = output / sha
    historical_tools(repo, sha, snapshot)
    original = snapshot / "original"
    original.mkdir()
    for ext in ("json", "tex", "pdf"):
        (original / f"{report_id}.{ext}").write_bytes(git(repo, "show", f"{sha}:reports/commits/{report_id}.{ext}"))
    result = subprocess.run(["python3", "-B", "-m", "scripts.reports", "build", str(original / f"{report_id}.json"), "--out", str(snapshot / "rendered")], cwd=snapshot, capture_output=True, timeout=90)
    (snapshot / "render.log").write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise ValueError("Original tools could not regenerate the historical report.")
    for ext in ("json", "tex"):
        if (original / f"{report_id}.{ext}").read_bytes() != (snapshot / "rendered" / f"{report_id}.{ext}").read_bytes():
            raise ValueError("Original JSON or TeX differs from its original renderer.")
    pdf = original / f"{report_id}.pdf"
    rendered = snapshot / "rendered" / pdf.name
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True, timeout=10).stdout
    if not re.search(r"^Pages:\s+1\s*$", info, re.MULTILINE) or pdf.stat().st_size > 250 * 1024 or pdf_text(pdf) != pdf_text(rendered):
        raise ValueError("Original PDF structure or extracted content differs from regenerated evidence.")
    if byte_identical and pdf.read_bytes() != rendered.read_bytes():
        raise ValueError("Same-environment historical PDF byte reproduction failed.")
    return dict(identity, reproduction="BYTE_IDENTICAL" if byte_identical else "EXACT_JSON_TEX_AND_PDF_SEMANTICS")


def verify(repo, base, head, output, byte_identical=False):
    repo = Path(repo).resolve(strict=True)
    base, head = commit(repo, base), commit(repo, head)
    if subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", base, head], capture_output=True).returncode:
        raise ValueError("Adoption/base is not an actual ancestor.")
    output = Path(output).absolute()
    if not output.resolve().is_relative_to(repo / "artifacts") or output.exists() or output.is_symlink():
        raise ValueError("History evidence requires a fresh directory under repository artifacts/.")
    if git(repo, "rev-parse", "--is-shallow-repository").strip() != b"false":
        raise ValueError("Shallow history cannot establish complete report ancestry.")
    commits = git(repo, "rev-list", "--reverse", f"{base}..{head}").decode().splitlines()
    if not commits:
        raise ValueError("No proposed authored history was selected.")
    identities = [report_identity(repo, sha) for sha in commits]
    if len({row["report_id"] for row in identities}) != len(identities):
        raise ValueError("Duplicate authored report identity.")
    output.mkdir(parents=True)
    rows = [reproduce(repo, row, output, byte_identical) for row in identities]
    result = {"result": "VERIFIED_ORIGINAL_REPORTS", "base_sha": base, "head_sha": head, "authored_commits": rows, "qualification": "Original identity and rendering only; independent execution/review gates are separate."}
    (output / "history.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--byte-identical", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.repo, args.base, args.head, args.out, args.byte_identical), indent=2))
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(2, f"History rejected: {error}\n")


if __name__ == "__main__":
    main()
