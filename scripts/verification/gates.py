"""Collect bounded process outcomes; unexecuted work never passes."""

import datetime as dt
import json
import os
import signal
import subprocess
import time
from pathlib import Path


def run_gate(name, command, cwd, output, environment=None, timeout=120):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    log = output / f"{name}.log"
    receipt = output / f"{name}.json"
    if receipt.exists() or receipt.is_symlink():
        raise FileExistsError("Completed process evidence already exists.")
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    clock = time.monotonic()
    timed_out = False
    with log.open("xb") as stream:
        try:
            process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)
                code = process.returncode
            result = "PASS" if code == 0 and not timed_out else "FAIL"
        except OSError:
            stream.write(b"Required executable could not be started.\n")
            code, result = None, "BLOCKED"
    observed = {
        "gate": name, "command": command, "started_at_utc": started,
        "finished_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "duration_seconds": round(time.monotonic() - clock, 3),
        "exit_code": code, "result": result, "timed_out": timed_out,
        "log": log.name,
    }
    with receipt.open("x") as stream:
        stream.write(json.dumps(observed, indent=2) + "\n")
    return observed


def require_pass(results, names):
    if not isinstance(results, list) or len(results) != len(names):
        raise ValueError("Missing or duplicate gate results.")
    by_name = {item["gate"]: item for item in results}
    if set(by_name) != set(names) or len(by_name) != len(results):
        raise ValueError("Gate identities do not match requirements.")
    for item in results:
        if item["result"] != "PASS" or item["exit_code"] != 0 or item["timed_out"] or item["duration_seconds"] is None:
            raise ValueError("A required process did not complete successfully.")
