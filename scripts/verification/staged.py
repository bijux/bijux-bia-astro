"""Export the index under artifacts without touching contributor work."""

import argparse
import datetime as dt
import json
import os
import subprocess
from pathlib import Path, PurePosixPath

from scripts.reports.candidate import fingerprint, git


def export(repo, report_id, output):
    repo = Path(repo).resolve(strict=True)
    output = Path(output).absolute()
    artifacts = repo / "artifacts"
    if not output.resolve().is_relative_to(artifacts) or output.resolve() == artifacts:
        raise ValueError("Candidate output must be a new directory under repository artifacts/.")
    if output.exists() or output.is_symlink():
        raise ValueError("Candidate output already exists.")
    identity = fingerprint(repo, report_id)
    tree = git(repo, "write-tree").decode().strip()
    entries = []
    folded = set()
    for entry in git(repo, "ls-tree", "-r", "-z", "--full-tree", tree).split(b"\0"):
        if not entry:
            continue
        header, raw = entry.split(b"\t", 1)
        mode, kind, oid = header.decode().split()
        name = os.fsdecode(raw)
        path = PurePosixPath(name)
        if path.is_absolute() or any(part in ("..", ".git", "") for part in path.parts):
            raise ValueError("Unsafe staged path.")
        if name.casefold() in folded:
            raise ValueError("Case-colliding staged paths are not portable.")
        folded.add(name.casefold())
        if kind != "blob" or mode not in ("100644", "100755", "120000"):
            raise ValueError("Unsupported staged object.")
        content = git(repo, "cat-file", "blob", oid)
        if mode == "120000":
            target = os.fsdecode(content)
            destination = output / "candidate" / name
            if Path(target).is_absolute() or not (destination.parent / target).resolve().is_relative_to(output / "candidate"):
                raise ValueError("Staged symlink escapes the candidate.")
        entries.append((name, mode, content))
    # Validate every entry before allocating or writing the snapshot.
    output.mkdir(parents=True)
    snapshot = output / "candidate"
    subprocess.run(["git", "clone", "--shared", "--no-checkout", "--quiet", str(repo), str(snapshot)], check=True, timeout=30)
    git(snapshot, "read-tree", tree)
    for name, mode, content in entries:
        path = snapshot / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() or path.is_symlink():
            raise ValueError("Snapshot path collision.")
        if mode == "120000":
            path.symlink_to(os.fsdecode(content))
        else:
            path.write_bytes(content)
            path.chmod(0o755 if mode == "100755" else 0o644)
    if fingerprint(repo, report_id) != identity or git(repo, "write-tree").decode().strip() != tree:
        raise ValueError("Index changed during export; candidate is invalid.")
    frozen = dict(identity, tree_sha=tree, report_id=report_id, frozen_at_utc=dt.datetime.now(dt.timezone.utc).isoformat())
    (output / "frozen.json").write_text(json.dumps(frozen, indent=2) + "\n", encoding="utf-8")
    return frozen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--report-id", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(export(args.repo, args.report_id, args.out), indent=2))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Export rejected: {error}\n")


if __name__ == "__main__":
    main()
