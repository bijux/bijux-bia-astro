"""Generate bounded, escaped LaTeX and PDF views of a change record."""

import datetime as dt
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .record import validate

ROOT = Path(__file__).resolve().parents[2]


def escape(value):
    replacements = {
        "\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "&": r"\&",
        "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
        "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(character, character) for character in value).replace("\n", " ").replace("\t", " ")


def path_text(value):
    # Evidence paths must wrap without permitting report text to become TeX.
    return escape(value).replace("/", r"/\allowbreak{}")


def render_tex(data):
    validate(data)
    illustration = data["record_kind"] == "illustrative"
    values = {
        key.upper(): escape(data[key])
        for key in ("title", "author", "why", "what", "how", "preserved", "risk", "limitations", "rollback")
    }
    values.update(
        STATUS="ILLUSTRATIVE / NOT A REPOSITORY COMMIT" if illustration else "LOCAL EVIDENCE / REMOTE CI NOT YET RUN",
        PREPARED=escape(data["prepared_at_utc"].replace("T", " ").replace("Z", "")),
        PARENT="NOT ASSIGNED (illustration)" if illustration else data["parent_sha"],
        DIGEST="NOT ASSIGNED (illustration)" if illustration else data["candidate_sha256"],
        WHERE=r"\par ".join(path_text(path) for path in data["where"]),
        FOOTER="Illustration only. No repository change or application validation is asserted." if illustration else "Engineering change summary and actual local verification.",
    )
    rows = []
    for check in data["checks"]:
        duration = "--" if check["duration_seconds"] is None else f'{check["duration_seconds"]:.2f} s'
        cells = [escape(value) for value in (check["gate"], check["command"], check["result"], duration)]
        cells.append(path_text(check["evidence_ref"]))
        rows.append(" & ".join(cells) + r" \\")
    values["CHECK_ROWS"] = "\n".join(rows)
    template = (ROOT / "reports/templates/commit-report.tex").read_text(encoding="utf-8")
    if set(re.findall(r"@@([A-Z_]+)@@", template)) != set(values):
        raise ValueError("Template and renderer fields differ.")
    return re.sub(r"@@([A-Z_]+)@@", lambda match: values[match.group(1)], template)


def build(data, output):
    validate(data)
    output = Path(output)
    for tool in ("pdflatex", "pdfinfo", "pdftotext"):
        if not shutil.which(tool):
            raise ValueError(f"Explicitly provision missing tool: {tool}")
    output.mkdir(parents=True, exist_ok=True)
    report_id = data["report_id"]
    targets = [output / f"{report_id}.{extension}" for extension in ("json", "tex", "pdf")]
    if any(target.exists() or target.is_symlink() for target in targets):
        raise ValueError("Refusing to overwrite report artifacts; use a fresh output directory.")
    source = render_tex(data)
    stamp = dt.datetime.strptime(data["prepared_at_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    environment = os.environ.copy()
    environment.update(LC_ALL="C", TZ="UTC", SOURCE_DATE_EPOCH=str(int(stamp.timestamp())), FORCE_SOURCE_DATE="1")
    scratch = ROOT / "artifacts/tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bia-report-", dir=scratch) as temporary:
        directory = Path(temporary)
        (directory / "report.tex").write_text(source, encoding="utf-8")
        result = subprocess.run(
            ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "report.tex"],
            cwd=directory, env=environment, capture_output=True, timeout=60,
        )
        log_path = directory / "report.log"
        log = log_path.read_text(errors="replace") if log_path.exists() else ""
        if result.returncode:
            raise ValueError("LaTeX failed; no report admitted. " + log[-1800:])
        if re.search(r"Overfull \\[hv]box|Missing character:", log):
            raise ValueError("Overflow or missing glyph; revise the report content.")
        pdf = directory / "report.pdf"
        information = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True, env=environment, timeout=10).stdout
        if not re.search(r"^Pages:\s+1\s*$", information, re.MULTILINE):
            raise ValueError("Exactly one page is required.")
        extracted = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True, check=True, env=environment, timeout=10).stdout
        for heading in ("WHY /", "WHAT /", "HOW /", "WHERE /", "PRESERVED /", "RISK /", "LIMITATIONS /", "ROLLBACK /", "VALIDATION /"):
            if heading not in extracted:
                raise ValueError(f"Missing required heading: {heading}")
        if pdf.stat().st_size > 250 * 1024:
            raise ValueError("PDF exceeds the 250 KiB budget.")
        (directory / f"{report_id}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (directory / f"{report_id}.tex").write_text(source, encoding="utf-8")
        shutil.copyfile(pdf, directory / f"{report_id}.pdf")
        for target in targets:
            shutil.copyfile(directory / target.name, target)
    return {"report_id": report_id, "pages": 1, "bytes": targets[2].stat().st_size, "artifacts": [str(target) for target in targets]}
