"""Validate or render a local BIA engineering change record."""

import argparse
import json
import subprocess
from pathlib import Path

from .record import load, validate
from .render import build


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("validate")
    check.add_argument("record", type=Path)
    check.add_argument("--require-commit", action="store_true")
    render = commands.add_parser("build")
    render.add_argument("record", type=Path)
    render.add_argument("--out", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        data = load(arguments.record)
        if arguments.command == "validate":
            validate(data, arguments.require_commit)
            print(json.dumps({"status": "STRUCTURALLY_VALID", "record_kind": data["record_kind"], "note": "Does not verify Git identity or execution claims."}, indent=2))
        else:
            print(json.dumps(build(data, arguments.out), indent=2))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Report rejected: {error}\n")


if __name__ == "__main__":
    main()
