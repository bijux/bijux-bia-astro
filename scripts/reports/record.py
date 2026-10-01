"""Validate report claims structurally; execution evidence is checked separately."""

import datetime as dt
import json
import math
import re
from pathlib import Path

from .candidate import ALGORITHM, REPORT_ID

FIELDS = {
    "schema_version", "record_kind", "report_id", "title", "author",
    "prepared_at_utc", "parent_sha", "candidate_sha256", "fingerprint_algorithm",
    "why", "what", "how", "where", "preserved", "risk", "limitations", "rollback",
    "checks", "remote_status",
}
CHECK_FIELDS = {
    "gate", "command", "result", "duration_seconds", "exit_code", "evidence_ref", "required",
}
OUTCOMES = {"PASS", "FAIL", "BLOCKED", "NOT_RUN", "NOT_APPLICABLE"}


def text(value, name, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{name} requires nonempty text of at most {limit} characters.")
    if any(ord(character) < 32 and character not in "\n\t" for character in value):
        raise ValueError(f"{name} contains a control character.")


def validate(data, require_commit=False):
    if not isinstance(data, dict) or set(data) != FIELDS:
        raise ValueError("Missing or unexpected report fields.")
    if type(data["schema_version"]) is not int or data["schema_version"] != 1:
        raise ValueError("Unsupported report schema.")
    if data["record_kind"] not in ("illustrative", "commit"):
        raise ValueError("Invalid record kind.")
    if require_commit and data["record_kind"] != "commit":
        raise ValueError("Illustrative records are not commit evidence.")
    if not isinstance(data["report_id"], str) or not 3 <= len(data["report_id"]) <= 100 or not REPORT_ID.fullmatch(data["report_id"]):
        raise ValueError("Invalid report ID.")
    for key, limit in (("title", 100), ("author", 90), ("prepared_at_utc", 20)):
        text(data[key], key, limit)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", data["prepared_at_utc"]):
        raise ValueError("An explicit UTC timestamp is required.")
    dt.datetime.strptime(data["prepared_at_utc"], "%Y-%m-%dT%H:%M:%SZ")
    if data["fingerprint_algorithm"] != ALGORITHM:
        raise ValueError("Unknown fingerprint algorithm.")
    if data["record_kind"] == "commit":
        for key, pattern in (("parent_sha", r"(?:[0-9a-f]{40}|[0-9a-f]{64})"), ("candidate_sha256", r"[0-9a-f]{64}")):
            value = data[key]
            if not isinstance(value, str) or not re.fullmatch(pattern, value) or set(value) == {"0"}:
                raise ValueError(f"Invalid {key}.")
    elif data["parent_sha"] is not None or data["candidate_sha256"] is not None:
        raise ValueError("Illustrations must not invent Git identities.")
    for key in ("why", "what", "how", "preserved", "risk", "limitations", "rollback"):
        text(data[key], key, 600)
    if not isinstance(data["where"], list) or not 1 <= len(data["where"]) <= 8:
        raise ValueError("Expected one to eight affected paths.")
    for path in data["where"]:
        text(path, "affected path", 140)
    if data["remote_status"] != "NOT_RUN":
        raise ValueError("A tracked report cannot claim future CI success.")
    checks = data["checks"]
    if not isinstance(checks, list) or not 1 <= len(checks) <= 6:
        raise ValueError("Expected one to six check summaries.")
    if any(not isinstance(check, dict) or set(check) != CHECK_FIELDS for check in checks):
        raise ValueError("Invalid check fields.")
    gates = []
    required = 0
    for check in checks:
        for key, limit in (("gate", 24), ("command", 180), ("evidence_ref", 100)):
            text(check[key], key, limit)
        gates.append(check["gate"])
        if not isinstance(check["result"], str) or check["result"] not in OUTCOMES or type(check["required"]) is not bool:
            raise ValueError("Invalid check outcome or requirement.")
        required += check["required"]
        duration, code = check["duration_seconds"], check["exit_code"]
        if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0):
            raise ValueError("Duration must be finite and nonnegative or null.")
        if code is not None and (type(code) is not int or not 0 <= code <= 255):
            raise ValueError("Invalid exit code.")
        if check["result"] == "PASS" and (code != 0 or duration is None):
            raise ValueError("PASS requires an observed zero exit and duration.")
        if check["result"] == "FAIL" and (code is None or code == 0 or duration is None):
            raise ValueError("FAIL requires an observed nonzero exit and duration.")
        if check["result"] in ("NOT_RUN", "NOT_APPLICABLE") and (code is not None or duration is not None):
            raise ValueError("Unexecuted checks cannot claim an observed duration or exit.")
        if data["record_kind"] == "commit" and check["required"] and check["result"] != "PASS":
            raise ValueError("A mandatory check did not pass.")
    if len(set(gates)) != len(gates):
        raise ValueError("Duplicate gates.")
    if data["record_kind"] == "commit" and not required:
        raise ValueError("A commit report requires a passing mandatory check.")
    return data


def load(path):
    def constants(value):
        raise ValueError(f"Nonfinite JSON number: {value}")

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    return validate(json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=constants, object_pairs_hook=pairs))
