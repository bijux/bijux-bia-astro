"""Execute frozen-index gates and bind genuine reports to their completed results."""

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import subprocess
from pathlib import Path

from scripts.reports.candidate import fingerprint, git
from scripts.reports.identity import validate_id
from scripts.reports.record import load, validate
from scripts.reports.render import build
from .gates import require_pass, run_gate
from .staged import export

TOOLS = {
    "Toolchain": ["npm", "run", "doctor"],
    "Developer tests": ["npm", "test"],
    "Report tools": ["npm", "run", "report-test"],
    "Staged controls": ["npm", "run", "verification-test"],
    "Index hygiene": ["git", "diff", "--cached", "--check"],
}
DESCRIPTION = {"title", "why", "what", "how", "where", "preserved", "risk", "limitations", "rollback"}


def owned_output(repo, output):
    repo = Path(repo).resolve(strict=True)
    output = Path(output).resolve(strict=True)
    if not output.is_relative_to(repo / "artifacts") or output == repo / "artifacts":
        raise ValueError("Admission evidence must be under repository artifacts/.")
    return repo, output


def preparation(repo, purpose):
    repo = Path(repo).resolve(strict=True)
    stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    report_id = validate_id(stamp.strftime("%Y%m%d-%H%M%S") + "-" + purpose)
    if any((repo / f"reports/commits/{report_id}.{ext}").exists() for ext in ("json", "tex", "pdf")):
        raise ValueError("Report identity already exists.")
    output = repo / "artifacts/admission" / report_id
    export(repo, report_id, output)
    (output / "preparation.json").write_text(json.dumps({"report_id": report_id, "prepared_at_utc": stamp.strftime("%Y-%m-%dT%H:%M:%SZ")}, indent=2) + "\n")
    return {"report_id": report_id, "output": str(output.relative_to(repo))}


def frozen_candidate(repo, output):
    repo, output = owned_output(repo, output)
    frozen = json.loads((output / "frozen.json").read_text())
    snapshot = output / "candidate"
    current = fingerprint(repo, frozen["report_id"])
    tested = fingerprint(snapshot, frozen["report_id"])
    for key in ("parent_sha", "candidate_sha256", "algorithm", "git_object_format"):
        if current[key] != frozen[key] or tested[key] != frozen[key]:
            raise ValueError("Parent or staged payload differs from the frozen candidate.")
    if git(snapshot, "write-tree").decode().strip() != frozen["tree_sha"]:
        raise ValueError("Snapshot index differs from its frozen tree.")
    if git(snapshot, "diff", "--name-only").strip():
        raise ValueError("Snapshot tracked bytes changed after export.")
    return repo, output, snapshot, frozen


def runtime_scope(snapshot):
    paths = [os.fsdecode(p) for p in git(snapshot, "diff", "--cached", "--name-only", "-z", "HEAD").split(b"\0") if p]
    tool_prefixes = ("docs/", "reports/", "scripts/reports/", "scripts/development/", "scripts/verification/", "tests/", "makes/", "configs/development/")
    tool_files = {"README.md", "CONTRIBUTING.md", "Makefile", ".gitignore"}
    for path in paths:
        if path == "package.json":
            before = json.loads(git(snapshot, "show", "HEAD:package.json"))
            after = json.loads((snapshot / path).read_text())
            if {key: value for key, value in before.items() if key != "scripts"} != {key: value for key, value in after.items() if key != "scripts"}:
                return True
            if any(before["scripts"][key] != after["scripts"].get(key) for key in ("dev", "start", "build", "preview", "prod", "local")):
                return True
        elif path not in tool_files and not path.startswith(tool_prefixes):
            return True
    return False


def execute(repo, output):
    repo, output, snapshot, frozen = frozen_candidate(repo, output)
    if (output / "results.json").exists():
        raise ValueError("Results already exist; prepare a fresh admission attempt.")
    environment = os.environ.copy()
    scratch = snapshot / "artifacts/tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    environment.update(TMPDIR=str(scratch), PYTHONDONTWRITEBYTECODE="1", npm_config_cache=str(snapshot / "artifacts/npm-cache"), npm_config_update_notifier="false")
    results = []
    # Doctor runs before optional provisioning; all other tooling gates are independent.
    results.append(run_gate("Toolchain", TOOLS["Toolchain"], snapshot, output / "gates", environment))
    if results[0]["result"] == "PASS":
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(run_gate, name, command, snapshot, output / "gates", environment) for name, command in TOOLS.items() if name != "Toolchain"]
            results.extend(future.result() for future in futures)
    application = runtime_scope(snapshot)
    if application and all(result["result"] == "PASS" for result in results) and len(results) == len(TOOLS):
        setup = run_gate("Locked setup", ["npm", "run", "setup"], snapshot, output / "gates", environment, timeout=180)
        results.append(setup)
        if setup["result"] == "PASS":
            # Adapter output trees and installs cannot overlap.
            netlify = output / "netlify"
            subprocess.run(["git", "clone", "--shared", "--no-checkout", "--quiet", str(snapshot), str(netlify)], check=True, timeout=30)
            git(netlify, "read-tree", frozen["tree_sha"])
            git(netlify, "checkout-index", "--all")
            netenv = dict(environment, TMPDIR=str(netlify / "artifacts/tmp"), npm_config_cache=str(netlify / "artifacts/npm-cache"))
            (netlify / "artifacts/tmp").mkdir(parents=True)
            netsetup = run_gate("Netlify setup", ["npm", "run", "setup"], netlify, output / "gates", netenv, timeout=180)
            results.append(netsetup)
            if netsetup["result"] == "PASS":
                nodeenv = {key: value for key, value in environment.items() if key not in {"NETLIFY", "NETLIFY_DEV", "AWS_LAMBDA_FUNCTION_NAME"}}
                netenv.update(NETLIFY="true")
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    futures = [pool.submit(run_gate, "Node build", ["npm", "run", "build"], snapshot, output / "gates", nodeenv, 900), pool.submit(run_gate, "Netlify compile", ["npm", "run", "astro", "--", "build"], netlify, output / "gates", netenv, 900)]
                    results.extend(future.result() for future in futures)
    required = list(TOOLS) + (["Locked setup", "Netlify setup", "Node build", "Netlify compile"] if application else [])
    passed = False
    try:
        require_pass(results, required)
        frozen_candidate(repo, output)
        passed = True
    except ValueError:
        pass
    receipt = {"schema_version": 1, "parent_sha": frozen["parent_sha"], "candidate_sha256": frozen["candidate_sha256"], "report_id": frozen["report_id"], "runtime_scope": application, "required": required, "results": results, "result": "PASS" if passed else "FAIL", "toolchain": json.loads((snapshot / "configs/development/toolchain.json").read_text()), "lock_sha256": hashlib.sha256((snapshot / "package-lock.json").read_bytes()).hexdigest(), "configuration": {key: environment.get(key) for key in ("PUBLIC_SEARCH_API", "PUBLIC_MONGO_API", "PUBLIC_GTAG", "PUBLIC_WEBSITE_STATE")}}
    (output / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt


def checked_results(repo, output):
    repo, output, snapshot, frozen = frozen_candidate(repo, output)
    receipt = json.loads((output / "results.json").read_text())
    required = list(TOOLS) + (["Locked setup", "Netlify setup", "Node build", "Netlify compile"] if runtime_scope(snapshot) else [])
    if receipt["required"] != required or receipt["result"] != "PASS" or any(receipt[key] != frozen[key] for key in ("parent_sha", "candidate_sha256", "report_id")):
        raise ValueError("Receipt is failed, stale or has incorrect requirements.")
    require_pass(receipt["results"], required)
    return repo, output, snapshot, frozen, receipt


def summaries(repo, output, receipt):
    rows = []
    for result in receipt["results"]:
        if result["gate"] in TOOLS:
            rows.append({"gate": result["gate"], "command": " ".join(result["command"]), "result": "PASS", "duration_seconds": result["duration_seconds"], "exit_code": 0, "evidence_ref": str((output / "results.json").relative_to(repo)), "required": True})
    if receipt["runtime_scope"]:
        rows.append({"gate": "Application", "command": "npm run setup; isolated Node npm run build and NETLIFY=true npm run astro -- build", "result": "PASS", "duration_seconds": sum(result["duration_seconds"] for result in receipt["results"] if result["gate"] not in TOOLS), "exit_code": 0, "evidence_ref": str((output / "results.json").relative_to(repo)), "required": True})
    return rows


def finalize(repo, output, description):
    repo, output, snapshot, frozen, receipt = checked_results(repo, output)
    description = json.loads(Path(description).read_text())
    if set(description) != DESCRIPTION:
        raise ValueError("Description fields must contain only public engineering context.")
    prepared = json.loads((output / "preparation.json").read_text())
    record = dict(schema_version=1, record_kind="commit", report_id=frozen["report_id"], author=git(repo, "config", "user.name").decode().strip(), prepared_at_utc=prepared["prepared_at_utc"], parent_sha=frozen["parent_sha"], candidate_sha256=frozen["candidate_sha256"], fingerprint_algorithm=frozen["algorithm"], checks=summaries(repo, output, receipt), remote_status="NOT_RUN", **description)
    validate(record, require_commit=True)
    build(record, output / "rendered")
    build(record, output / "regenerated")
    for extension in ("json", "tex", "pdf"):
        name = f"{record['report_id']}.{extension}"
        content = (output / "rendered" / name).read_bytes()
        if content != (output / "regenerated" / name).read_bytes():
            raise ValueError("Canonical regeneration differs.")
        target = repo / "reports/commits" / name
        if target.exists() or target.is_symlink():
            raise ValueError("Report artifact already exists.")
    for extension in ("json", "tex", "pdf"):
        name = f"{record['report_id']}.{extension}"
        (repo / "reports/commits" / name).write_bytes((output / "rendered" / name).read_bytes())
    return {"report_id": record["report_id"], "result": "GENERATED; stage triplet, inspect PDF, then check freshness"}


def check(repo, output, message=None):
    repo, output, snapshot, frozen, receipt = checked_results(repo, output)
    report_id = frozen["report_id"]
    data = json.loads(git(repo, "show", f":reports/commits/{report_id}.json"))
    validate(data, require_commit=True)
    if data["checks"] != summaries(repo, output, receipt) or data["parent_sha"] != frozen["parent_sha"] or data["candidate_sha256"] != frozen["candidate_sha256"]:
        raise ValueError("Staged report is not bound to the completed gates.")
    for extension in ("json", "tex", "pdf"):
        name = f"{report_id}.{extension}"
        if git(repo, "show", f":reports/commits/{name}") != (output / "regenerated" / name).read_bytes():
            raise ValueError("Staged triplet differs from canonical output.")
        entry = git(repo, "ls-files", "--stage", "--", f"reports/commits/{name}").decode()
        if not entry.startswith("100644 "):
            raise ValueError("Report artifacts must be regular nonexecutable files.")
    if message is not None:
        trailers = subprocess.run(["git", "interpret-trailers", "--parse"], input=Path(message).read_bytes(), capture_output=True, check=True).stdout.decode().splitlines()
        ids = [line.split(":", 1)[1].strip() for line in trailers if line.split(":", 1)[0].lower() == "report-id"]
        if ids != [report_id]:
            raise ValueError("Commit message requires exactly one matching Report-ID trailer.")
    return {"result": "ADMITTED", "report_id": report_id, "parent_sha": frozen["parent_sha"], "candidate_sha256": frozen["candidate_sha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--purpose", required=True)
    for name in ("run", "finalize", "check"):
        command = commands.add_parser(name)
        command.add_argument("--out", type=Path, required=True)
        if name == "finalize":
            command.add_argument("--description", type=Path, required=True)
        if name == "check":
            command.add_argument("--message", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = preparation(args.repo, args.purpose)
        elif args.command == "run":
            result = execute(args.repo, args.out)
        elif args.command == "finalize":
            result = finalize(args.repo, args.out, args.description)
        else:
            result = check(args.repo, args.out, args.message)
        print(json.dumps(result, indent=2))
        if result.get("result") == "FAIL":
            raise SystemExit(1)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Admission rejected: {error}\n")


if __name__ == "__main__":
    main()
