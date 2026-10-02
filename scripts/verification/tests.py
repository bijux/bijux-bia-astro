"""Run collected tooling tests with generated files confined to artifacts."""

import os
import tempfile
import unittest
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[2]
    scratch = root / "artifacts/tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = str(scratch)
    tempfile.tempdir = str(scratch)
    suite = unittest.defaultTestLoader.discover(str(root / "tests/verification"))
    if suite.countTestCases() == 0:
        raise SystemExit("No verification tests collected.")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
