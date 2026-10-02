"""Resolve historical trailers without changing historical evidence identities."""

import argparse
import hashlib
import json
from pathlib import Path

from .candidate import fingerprint, git
from .identity import legacy_archives, validate_id


def lookup(repo, report_id):
    repo = Path(repo).resolve(strict=True)
    entry = legacy_archives(repo).get(report_id)
    if entry is None:
        validate_id(report_id)
        paths = [repo / f"reports/commits/{report_id}.{ext}" for ext in ("json", "tex", "pdf")]
        if any(not path.is_file() or path.is_symlink() for path in paths):
            raise ValueError("Missing canonical report triplet.")
        return {"report_id": report_id, "paths": [str(path.relative_to(repo)) for path in paths]}
    sha = entry["commit_sha"]
    trailer = git(repo, "show", "-s", "--format=%(trailers:key=Report-ID,valueonly)", sha).decode().strip()
    if trailer != report_id:
        raise ValueError("Legacy trailer does not match archive identity.")
    paths = []
    for extension, expected in entry["sha256"].items():
        original = git(repo, "show", f"{sha}:reports/commits/{report_id}.{extension}")
        path = repo / f"reports/commits/{entry['archive_stem']}.{extension}"
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing regular archive artifact.")
        if hashlib.sha256(original).hexdigest() != expected or path.read_bytes() != original:
            raise ValueError("Historical report bytes differ from archive.")
        paths.append(str(path.relative_to(repo)))
    data = json.loads(git(repo, "show", f"{sha}:reports/commits/{report_id}.json"))
    identity = fingerprint(repo, report_id, sha)
    if data["parent_sha"] != identity["parent_sha"] or data["candidate_sha256"] != identity["candidate_sha256"]:
        raise ValueError("Historical report identity differs from original tree.")
    validate_id(entry["archive_stem"], data["prepared_at_utc"])
    return {"report_id": report_id, "commit_sha": sha, "archive_stem": entry["archive_stem"], "paths": paths}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_id")
    parser.add_argument("--repo", type=Path, default=Path("."))
    args = parser.parse_args()
    try:
        print(json.dumps(lookup(args.repo, args.report_id), indent=2))
    except (ValueError, OSError) as error:
        parser.exit(2, f"Archive rejected: {error}\n")


if __name__ == "__main__":
    main()
