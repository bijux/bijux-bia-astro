"""Canonical preparation identities and explicitly retained legacy archives."""

import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT_ID = re.compile(r"([0-9]{8}-[0-9]{6})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\Z")


def validate_id(report_id, prepared_at_utc=None):
    if not isinstance(report_id, str) or not 19 <= len(report_id) <= 100:
        raise ValueError("Invalid report ID length.")
    match = REPORT_ID.fullmatch(report_id)
    if not match:
        raise ValueError("Report ID must be YYYYMMDD-HHMMSS-descriptive-purpose.")
    stamp = dt.datetime.strptime(match[1], "%Y%m%d-%H%M%S")
    if prepared_at_utc is not None and stamp.strftime("%Y-%m-%dT%H:%M:%SZ") != prepared_at_utc:
        raise ValueError("Report ID timestamp differs from preparation UTC.")
    return report_id


def legacy_archives(root=ROOT):
    path = Path(root) / "reports/legacy-archive.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or set(data) != {"schema_version", "archives"}:
        raise ValueError("Invalid legacy archive manifest.")
    entries = {}
    for entry in data["archives"]:
        if set(entry) != {"report_id", "archive_stem", "commit_sha", "sha256"}:
            raise ValueError("Invalid legacy archive entry.")
        old_id = entry["report_id"]
        if not isinstance(old_id, str) or not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", old_id):
            raise ValueError("Unsafe legacy identity.")
        validate_id(entry["archive_stem"])
        if not re.fullmatch(r"[0-9a-f]{40}", entry["commit_sha"]):
            raise ValueError("Invalid historical commit.")
        if set(entry["sha256"]) != {"json", "tex", "pdf"} or any(
            not re.fullmatch(r"[0-9a-f]{64}", value) for value in entry["sha256"].values()
        ):
            raise ValueError("Invalid historical artifact digests.")
        if old_id in entries or entry["archive_stem"] in {item["archive_stem"] for item in entries.values()}:
            raise ValueError("Duplicate legacy archive identity.")
        entries[old_id] = entry
    return entries
