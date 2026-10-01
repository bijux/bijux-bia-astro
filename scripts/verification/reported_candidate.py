"""Independently replay introduced controls and check a retained integration candidate."""

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
from pathlib import Path

from scripts.reports.candidate import git
from scripts.reports.history import verify
from scripts.reports.integration import commit, expected_tree
from .gates import require_pass, run_gate

ADOPTION = "808857d90a142ab0dc10c873ec44a2e24a344a76"
APPLICATION_PATHS = ("src", "public", "astro.config.mjs", "Dockerfile", "helm-chart", "netlify.toml", ".nvmrc", ".node-version")
ORIGINAL_COMMANDS = ("dev", "start", "build", "preview", "local", "prod")


def preserved_application(repo, sha):
    """This initial gate reuses builds only for byte-identical inherited application inputs."""
    sha = commit(repo, sha)
    if git(repo, "diff", "--name-only", ADOPTION, sha, "--", *APPLICATION_PATHS).strip():
        raise ValueError("Application bytes changed; extend the independently verified gate contract before promotion.")
    before = json.loads(git(repo, "show", f"{ADOPTION}:package.json"))
    after = json.loads(git(repo, "show", f"{sha}:package.json"))
    if {key: value for key, value in before.items() if key not in ("scripts", "devDependencies")} != {key: value for key, value in after.items() if key not in ("scripts", "devDependencies")} or any(before["scripts"][key] != after["scripts"].get(key) for key in ORIGINAL_COMMANDS):
        raise ValueError("Inherited runtime manifest or commands changed.")
    before_lock = json.loads(git(repo, "show", f"{ADOPTION}:package-lock.json"))["packages"]
    after_lock = json.loads(git(repo, "show", f"{sha}:package-lock.json"))["packages"]
    for name, record in before_lock.items():
        if name and after_lock.get(name) != record:
            raise ValueError("An inherited locked package changed; build reuse is invalid.")
    additions = set(after_lock) - set(before_lock)
    if any(not after_lock[name].get("dev") for name in additions):
        raise ValueError("New runtime lock entries cannot reuse inherited builds.")
    original_config = git(repo, "show", f"{ADOPTION}:tsconfig.json")
    candidate_config = git(repo, "show", f"{sha}:tsconfig.json")
    configuration = "UNCHANGED"
    if candidate_config != original_config:
        expected = dict(json.loads(original_config), exclude=["${configDir}/dist", "${configDir}/artifacts"])
        if json.loads(candidate_config) != expected or not git(repo, "ls-tree", sha, "--", "tsconfig.json").startswith(b"100644 blob "):
            raise ValueError("Typecheck configuration changed outside the exact run-output exclusion.")
        configuration = "RUN_OUTPUT_EXCLUSION_ONLY"
    return {"commit_sha": sha, "application": "UNCHANGED", "typecheck_configuration": configuration, "inherited_lock_entries": len(before_lock) - 1, "new_development_entries": sorted(additions)}


def snapshot(repo, sha, destination):
    # Checkout only after rejecting nonportable entries; no contributor worktree is mutated.
    for raw in git(repo, "ls-tree", "-r", "-z", sha).split(b"\0"):
        if not raw:
            continue
        header, name = raw.split(b"\t", 1)
        mode, kind, _ = header.split()
        if mode not in (b"100644", b"100755") or kind != b"blob" or b".git" in name.split(b"/"):
            raise ValueError("Epoch checkout has unsupported paths/objects.")
    subprocess.run(["git", "clone", "--shared", "--no-checkout", "--quiet", str(repo), str(destination)], check=True, timeout=30)
    git(destination, "checkout", "--detach", "--quiet", sha)


def adapter_snapshots(repo, sha, output, environment):
    profiles = []
    for name, adapter in (("Node candidate", "node"), ("Netlify candidate", "netlify")):
        checkout = output / adapter
        snapshot(repo, sha, checkout)
        scratch = checkout / "artifacts/tmp"
        scratch.mkdir(parents=True)
        env = dict(environment, npm_config_cache=str(repo / "artifacts/npm-cache"), TMPDIR=str(scratch))
        profiles.append((name, adapter, checkout, env))
    return profiles


def execute(repo, head, output):
    repo = Path(repo).resolve(strict=True)
    head = commit(repo, head)
    candidate = git(repo, "rev-parse", "HEAD").decode().strip()
    if git(repo, "diff", "HEAD", "--name-only").strip() or git(repo, "diff", "--cached", "--name-only").strip():
        raise ValueError("Reported remote candidate must be an unchanged committed checkout.")
    output = Path(output).absolute()
    if not output.resolve().is_relative_to(repo / "artifacts") or output.exists() or output.is_symlink():
        raise ValueError("Use a fresh verification output under repository artifacts/.")
    if candidate != head:
        parents = git(repo, "rev-list", "--parents", "-n", "1", candidate).decode().split()[1:]
        if len(parents) != 2 or parents[1] != head or git(repo, "rev-parse", candidate + "^{tree}").decode().strip() != expected_tree(repo, parents[0], head):
            raise ValueError("Checkout is not the expected automatic integration of the authored head.")
    output.mkdir(parents=True)
    history = verify(repo, ADOPTION, head, output / "reports")
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", npm_config_update_notifier="false")
    epochs = []
    for row in history["authored_commits"]:
        sha = row["commit_sha"]
        preservation = preserved_application(repo, sha)
        checkout = output / "authored" / sha
        snapshot(repo, sha, checkout)
        scratch = checkout / "artifacts/tmp"
        scratch.mkdir(parents=True)
        env = dict(environment, TMPDIR=str(scratch), npm_config_cache=str(repo / "artifacts/npm-cache"))
        scripts = json.loads((checkout / "package.json").read_text())["scripts"]
        commands = {"Report epoch": ["python3", "-B", "-m", "unittest", "discover", "-s", "tests/reports", "-v"]}
        if (checkout / "configs/development/toolchain.json").exists():
            commands["Toolchain epoch"] = ["node", "scripts/development/bootstrap.mjs", "doctor"]
        if (checkout / "tests/development").exists():
            files = sorted(str(path.relative_to(checkout)) for path in (checkout / "tests/development").glob("*.test.mjs"))
            if not files:
                raise ValueError("Introduced developer suite collected zero tests.")
            commands["Developer epoch"] = ["node", "--test", *files]
        if "verification-test" in scripts:
            commands["Staged epoch"] = ["npm", "run", "verification-test"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(run_gate, name, command, checkout, checkout / "artifacts/gates", env, 180) for name, command in commands.items()]
            results = [future.result() for future in futures]
        require_pass(results, list(commands))
        report_log = (checkout / "artifacts/gates/Report epoch.log").read_text()
        if not re.search(r"Ran [1-9][0-9]* tests?", report_log):
            raise ValueError("Epoch report suite did not execute intended tests.")
        if "fixture-test" in scripts:
            results.append(run_gate("Epoch setup", ["npm", "run", "setup"], checkout, checkout / "artifacts/gates", env, 180))
            require_pass(results, [*commands, "Epoch setup"])
            results.append(run_gate("Fixture epoch", ["npm", "run", "fixture-test"], checkout, checkout / "artifacts/gates", env, 120))
            require_pass(results, [*commands, "Epoch setup", "Fixture epoch"])
        if git(checkout, "diff", "HEAD", "--name-only").strip():
            raise ValueError("Epoch execution changed its tracked inputs.")
        epochs.append(dict(row, preservation=preservation, results=results))
    preserved_application(repo, candidate)
    profiles = adapter_snapshots(repo, candidate, output, environment)
    results = []
    setup_names = []
    for _, adapter, checkout, env in profiles:
        name = "Node setup" if adapter == "node" else "Netlify setup"
        results.append(run_gate(name, ["npm", "run", "setup"], checkout, output / "gates", env, 180))
        setup_names.append(name)
        require_pass(results, setup_names)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run_gate, name, ["npm", "run", "fixture-build", "--", adapter], checkout, output / "gates", env, 900) for name, adapter, checkout, env in profiles]
        results.extend(future.result() for future in futures)
    require_pass(results, [*setup_names, "Node candidate", "Netlify candidate"])
    if git(repo, "diff", "HEAD", "--name-only").strip() or any(git(checkout, "diff", "HEAD", "--name-only").strip() for _, _, checkout, _ in profiles):
        raise ValueError("Candidate execution changed tracked inputs.")
    identity = {"candidate_sha": candidate, "tree_sha": git(repo, "rev-parse", "HEAD^{tree}").decode().strip(), "parents": git(repo, "rev-list", "--parents", "-n", "1", candidate).decode().split()[1:]}
    (output / "candidate.json").write_text(json.dumps(identity, indent=2) + "\n")
    receipt = dict(identity, result="PASS", authored_head=head, adoption=ADOPTION, epochs=epochs, integration_results=results, qualification="Unchanged inherited application inputs plus introduced epoch controls; real viewer/platform/UI coverage is not asserted.")
    (output / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--authored-head", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args.repo, args.authored_head, args.out), indent=2))
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Reported candidate rejected: {error}\n")


if __name__ == "__main__":
    main()
