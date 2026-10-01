"""Identify the staged payload without modifying the working tree."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from .identity import REPORT_ID, legacy_archives, validate_id

ALGORITHM = "bia-git-candidate-sha256-v1"


def git(repo, *arguments):
    result = subprocess.run(
        ["git", "-C", str(repo), *arguments],
        capture_output=True,
        timeout=30,
    )
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", "replace").strip())
    return result.stdout


def fingerprint(repo, report_id, revision="INDEX", amend=False):
    repo = Path(repo).resolve(strict=True)
    legacy = legacy_archives().get(report_id) if isinstance(report_id, str) else None
    if legacy:
        if revision == "INDEX" or amend:
            raise ValueError("Legacy IDs identify archived commits only.")
    else:
        validate_id(report_id)
    object_format = git(repo, "rev-parse", "--show-object-format").decode().strip()
    if object_format not in ("sha1", "sha256"):
        raise ValueError("Unsupported Git object format.")
    if revision == "INDEX":
        parent = git(repo, "rev-parse", "--verify", "HEAD^{commit}").decode().strip()
        if amend:
            lineage = git(repo, "rev-list", "--parents", "-n", "1", parent).decode().split()
            if len(lineage) != 2:
                raise ValueError("Amending a root or merge commit needs a separate protocol.")
            parent = lineage[1]
        tree = git(repo, "write-tree").decode().strip()
    else:
        if amend:
            raise ValueError("Amend mode applies only to the staged index.")
        if revision.startswith("-"):
            raise ValueError("Revision cannot be an option.")
        commit = git(
            repo, "rev-parse", "--verify", "--end-of-options", revision + "^{commit}"
        ).decode().strip()
        if legacy and commit != legacy["commit_sha"]:
            raise ValueError("Legacy identity belongs to another historical commit.")
        lineage = git(repo, "rev-list", "--parents", "-n", "1", commit).decode().split()
        if len(lineage) != 2:
            raise ValueError("Root and merge commits need a separate report protocol.")
        parent = lineage[1]
        tree = git(repo, "rev-parse", "--verify", commit + "^{tree}").decode().strip()
    excluded = {
        f"reports/commits/{report_id}.{extension}".encode()
        for extension in ("json", "tex", "pdf")
    }
    entries = []
    for entry in git(repo, "ls-tree", "-r", "-z", "--full-tree", tree).split(b"\0"):
        if not entry:
            continue
        header, path = entry.split(b"\t", 1)
        mode, kind, _ = header.split(b" ")
        if kind != b"blob" or mode not in (b"100644", b"100755", b"120000"):
            raise ValueError("Unsupported tree entry; submodules cannot be omitted.")
        if path not in excluded:
            entries.append((path, header + b"\t" + path + b"\0"))
    digest = hashlib.sha256(
        b"BIA-ASTRO-CANDIDATE-V1\0"
        + object_format.encode()
        + b"\0"
        + parent.encode()
        + b"\0"
    )
    for _, entry in sorted(entries):
        digest.update(entry)
    return {
        "algorithm": ALGORITHM,
        "parent_sha": parent,
        "candidate_sha256": digest.hexdigest(),
        "git_object_format": object_format,
        "payload_paths": len(entries),
        "excluded_paths": sorted(path.decode() for path in excluded),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--report-id", required=True)
    parser.add_argument("--revision", default="INDEX")
    parser.add_argument("--amend", action="store_true", help="Use the existing commit's parent for an authorized amendment.")
    arguments = parser.parse_args()
    try:
        print(json.dumps(fingerprint(arguments.repo, arguments.report_id, arguments.revision, arguments.amend), indent=2))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Candidate rejected: {error}\n")


if __name__ == "__main__":
    main()
