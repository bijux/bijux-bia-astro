"""Verify exact GitHub merge provenance; generated nodes cannot carry extra changes."""

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

from .candidate import git


def commit(repo, revision):
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
        raise ValueError("An immutable full commit SHA is required.")
    resolved = git(repo, "rev-parse", "--verify", revision + "^{commit}").decode().strip()
    if resolved != revision:
        raise ValueError("Commit identity changed.")
    return resolved


def expected_tree(repo, base, head):
    base, head = commit(repo, base), commit(repo, head)
    result = subprocess.run(["git", "-C", str(repo), "merge-tree", "--write-tree", base, head], capture_output=True, timeout=30)
    if result.returncode:
        raise ValueError("Automatic integration has conflicts; admitted authored resolution is required.")
    tree = result.stdout.decode().splitlines()[0]
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", tree):
        raise ValueError("Invalid automatic integration tree.")
    return tree


def validate_node(repo, merge, base, head, provenance, repository, checks):
    merge, base, head = [commit(repo, value) for value in (merge, base, head)]
    parents = git(repo, "rev-list", "--parents", "-n", "1", merge).decode().split()[1:]
    if parents != [base, head]:
        raise ValueError("Generated integration requires exactly the checked base and retained head parents, in order.")
    tree = git(repo, "rev-parse", merge + "^{tree}").decode().strip()
    expected = expected_tree(repo, base, head)
    if tree != expected:
        raise ValueError("Integration tree contains unreported resolution or extra changes.")
    if not provenance.get("merged") or provenance.get("merge_commit_sha") != merge or not provenance.get("merged_at") or not provenance.get("merged_by"):
        raise ValueError("GitHub does not identify this node as the completed PR merge.")
    if provenance["base"]["repo"]["full_name"] != repository or provenance["head"]["repo"]["full_name"] != repository or provenance["base"]["ref"] != "main" or provenance["head"]["sha"] != head:
        raise ValueError("PR provenance belongs to another repository, base or head.")
    number = provenance.get("number")
    subject = git(repo, "show", "-s", "--format=%s", merge).decode().strip()
    if type(number) is not int or not subject.startswith(f"Merge pull request #{number} from "):
        raise ValueError("Integration subject does not match GitHub PR provenance.")
    if git(repo, "show", "-s", "--format=%(trailers:key=Report-ID,valueonly)", merge).strip():
        raise ValueError("A generated integration node must not masquerade as an authored report.")
    if checks.get("repository") != repository or checks.get("base_sha") != base or checks.get("head_sha") != head or checks.get("tree_sha") != tree:
        raise ValueError("Integration checks do not identify the retained inputs.")
    required = {"head", "integration"}
    rows = checks.get("runs", [])
    if {row.get("candidate") for row in rows} != required or len(rows) != 2:
        raise ValueError("Both exact head and integration runs are required.")
    for row in rows:
        sha = commit(repo, row.get("sha"))
        if row.get("candidate") == "head" and sha != head:
            raise ValueError("Head checks ran against another commit.")
        if row.get("candidate") == "integration":
            if git(repo, "rev-list", "--parents", "-n", "1", sha).decode().split()[1:] != [base, head] or git(repo, "rev-parse", sha + "^{tree}").decode().strip() != tree:
                raise ValueError("Checked integration has another parent or tree.")
        if row.get("conclusion") != "success" or row.get("status") != "completed" or not row.get("url") or not row.get("checked_at_utc"):
            raise ValueError("Integration checks are missing, pending, skipped or failed.")
    return {"result": "VERIFIED_GENERATED_INTEGRATION", "merge_sha": merge, "base_sha": base, "head_sha": head, "tree_sha": tree, "pull_request": provenance["html_url"]}


def fetch_json(repository, endpoint):
    result = subprocess.run(["gh", "api", f"repos/{repository}/{endpoint}"], capture_output=True, check=True, timeout=60)
    return json.loads(result.stdout)


def verify_live_checks(repo, repository, checks):
    """Read Actions outcomes and their checkout identities independently of caller claims."""
    scratch = Path(repo).resolve() / "artifacts/integration-downloads"
    scratch.mkdir(parents=True, exist_ok=True)
    for row in checks["runs"]:
        run_id = row.get("run_id")
        if type(run_id) is not int or run_id <= 0:
            raise ValueError("An actual Actions run identity is required.")
        run = fetch_json(repository, f"actions/runs/{run_id}")
        expected_event = "push" if row["candidate"] == "head" else "pull_request"
        if run["event"] != expected_event or run["path"] != ".github/workflows/bootstrap_admission.yaml" or run["head_sha"] != checks["head_sha"] or run["status"] != "completed" or run["conclusion"] != "success" or run["html_url"] != row["url"]:
            raise ValueError("Live Actions result differs from the claimed candidate/run.")
        jobs = fetch_json(repository, f"actions/runs/{run_id}/jobs?per_page=100")
        if jobs["total_count"] != 2 or {job["name"] for job in jobs["jobs"]} != {"Bootstrap verification", "Bootstrap result"} or any(job["status"] != "completed" or job["conclusion"] != "success" for job in jobs["jobs"]):
            raise ValueError("A bootstrap job is missing, failed, skipped or pending.")
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            subprocess.run(["gh", "run", "download", str(run_id), "--repo", repository, "--name", f"bootstrap-identity-{row['sha']}", "--dir", directory], capture_output=True, check=True, timeout=60)
            receipt = json.loads((Path(directory) / "candidate.json").read_text())
            sha = commit(repo, row["sha"])
            parents = git(repo, "rev-list", "--parents", "-n", "1", sha).decode().split()[1:]
            tree = git(repo, "rev-parse", sha + "^{tree}").decode().strip()
            if receipt != {"candidate_sha": sha, "tree_sha": tree, "parents": parents}:
                raise ValueError("The independently executed workflow checked another Git tree.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--repository", required=True)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--checks", type=Path, required=True)
    args = parser.parse_args()
    try:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
            raise ValueError("Invalid repository identity.")
        provenance = fetch_json(args.repository, f"pulls/{args.pr}")
        checks = json.loads(args.checks.read_text())
        result = validate_node(args.repo, provenance["merge_commit_sha"], args.base, args.head, provenance, args.repository, checks)
        verify_live_checks(args.repo, args.repository, checks)
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Integration rejected: {error}\n")


if __name__ == "__main__":
    main()
