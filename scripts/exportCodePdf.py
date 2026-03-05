#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer


DEFAULT_MAX_FILE_MB = 5
DEFAULT_SCOPE = "code-only"
DEFAULT_INCLUDE_HIDDEN = True
DEFAULT_BINARY_SAMPLE_BYTES = 65536
DEFAULT_BINARY_RATIO_THRESHOLD = 0.30

INCLUDE_DIRS = [
    "assets",
    "backend",
    "components",
    "contracts",
    "controllers",
    "docs",
    "electron",
    "hooks",
    "orchestrators",
    "public",
    "resources",
    "scripts",
    "services",
    "styles",
    "tests",
    "workers",
]

EXCLUDED_DIRS = {
    ".git",
    "artifacts",
    "dist",
    "node_modules",
    "release",
}


@dataclass
class IncludedFile:
    path: str
    abs_path: Path
    size_bytes: int
    modified_at_ms: int
    encoding: str
    text: str
    line_count: int


@dataclass
class SkippedFile:
    path: str
    reason: str
    detail: str | None = None


def parse_bool(value: str) -> bool:
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    raise ValueError(f"Invalid boolean value: {value!r}")


def load_package_version(root: Path) -> str:
    package_path = root / "package.json"
    if not package_path.exists():
        return "unknown"
    try:
        raw = json.loads(package_path.read_text(encoding="utf-8"))
    except Exception:
        return "unknown"
    version = raw.get("version")
    return str(version).strip() if version else "unknown"


def default_output_path(root: Path, version: str) -> Path:
    return root / "artifacts" / f"FullAppCode-{version}.pdf"


def should_skip_dir(name: str) -> bool:
    return (
        name in EXCLUDED_DIRS
        or name.startswith("release-")
        or name.startswith("tmp-")
    )


def is_hidden(name: str) -> bool:
    return name.startswith(".")


def gather_candidate_files(root: Path, include_hidden: bool) -> list[Path]:
    candidates: list[Path] = []

    for child in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        name = child.name
        if should_skip_dir(name):
            continue
        if child.is_file():
            if not include_hidden and is_hidden(name):
                continue
            candidates.append(child)

    for dir_name in INCLUDE_DIRS:
        dir_path = root / dir_name
        if not dir_path.is_dir():
            continue
        for current_root, dirnames, filenames in os.walk(dir_path):
            dirnames[:] = sorted(
                [
                    d
                    for d in dirnames
                    if not should_skip_dir(d) and (include_hidden or not is_hidden(d))
                ],
                key=str.lower,
            )
            for filename in sorted(filenames, key=str.lower):
                if not include_hidden and is_hidden(filename):
                    continue
                candidates.append(Path(current_root) / filename)

    unique = sorted({p.resolve() for p in candidates}, key=lambda p: str(p).lower())
    return unique


def looks_binary(path: Path) -> tuple[bool, float]:
    sample = b""
    with path.open("rb") as handle:
        sample = handle.read(DEFAULT_BINARY_SAMPLE_BYTES)

    if not sample:
        return False, 0.0
    if b"\x00" in sample:
        return True, 1.0

    control = 0
    for byte in sample:
        if byte in (9, 10, 13):
            continue
        if 32 <= byte <= 126:
            continue
        if byte >= 128:
            continue
        control += 1

    ratio = control / len(sample)
    return ratio > DEFAULT_BINARY_RATIO_THRESHOLD, ratio


def decode_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace"), "latin-1(replace)"


def number_lines(text: str) -> str:
    lines = text.splitlines()
    if not lines:
        return "1: "
    width = max(2, len(str(len(lines))))
    numbered = [f"{index:>{width}}: {line}" for index, line in enumerate(lines, start=1)]
    return "\n".join(numbered)


def format_iso_utc(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def build_story(
    version: str,
    output_path: Path,
    root: Path,
    included: Iterable[IncludedFile],
    skipped: Iterable[SkippedFile],
    include_hidden: bool,
    max_file_mb: int,
) -> list:
    included_list = list(included)
    skipped_list = list(skipped)
    skipped_by_reason = Counter(entry.reason for entry in skipped_list)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    heading_style = styles["Heading2"]
    body_style = styles["BodyText"]
    body_style.leading = 14
    small_style = ParagraphStyle(
        "Small",
        parent=styles["BodyText"],
        fontSize=9,
        leading=11,
    )
    toc_style = ParagraphStyle(
        "Toc",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=10,
    )
    code_style = ParagraphStyle(
        "Code",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=6.8,
        leading=7.6,
    )

    story: list = []
    story.append(Paragraph("Full App Code Export", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"Document ID: <b>{escape(output_path.stem)}</b>", body_style))
    story.append(Paragraph(f"Version: <b>{escape(version)}</b>", body_style))
    story.append(Paragraph(f"Generated: <b>{escape(now_utc)}</b>", body_style))
    story.append(Paragraph(f"Root Path: <b>{escape(str(root))}</b>", body_style))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Scope: <b>code-only</b> (single PDF with TOC, deterministic path order, line numbers).",
            small_style,
        )
    )
    story.append(
        Paragraph(
            f"Include hidden: <b>{'true' if include_hidden else 'false'}</b>, max file size: <b>{max_file_mb} MB</b>.",
            small_style,
        )
    )
    story.append(
        Paragraph(
            "Excluded roots: .git, node_modules, dist, release, release-*, tmp-*, artifacts.",
            small_style,
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"Included files: <b>{len(included_list)}</b> | Skipped files: <b>{len(skipped_list)}</b>",
            body_style,
        )
    )
    if skipped_by_reason:
        for reason, count in sorted(skipped_by_reason.items()):
            story.append(Paragraph(f"Skipped ({escape(reason)}): {count}", small_style))

    story.append(PageBreak())
    story.append(Paragraph("Table of Contents", heading_style))
    story.append(Spacer(1, 6))
    for index, item in enumerate(included_list, start=1):
        story.append(
            Paragraph(
                f"{index:04d}  {escape(item.path)}",
                toc_style,
            )
        )
    story.append(PageBreak())

    for index, item in enumerate(included_list, start=1):
        story.append(Paragraph(f"Section {index:04d}: {escape(item.path)}", heading_style))
        meta = (
            f"size={item.size_bytes} bytes | lines={item.line_count} | "
            f"encoding={escape(item.encoding)} | modified={escape(format_iso_utc(item.modified_at_ms))}"
        )
        story.append(Paragraph(meta, small_style))
        story.append(Spacer(1, 4))
        story.append(Preformatted(number_lines(item.text), code_style))
        if index < len(included_list):
            story.append(PageBreak())

    return story


def on_page(doc_id: str):
    def _draw(canvas, doc) -> None:  # noqa: ANN001
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        page_number = canvas.getPageNumber()
        canvas.drawString(doc.leftMargin, 14, doc_id)
        canvas.drawRightString(LETTER[0] - doc.rightMargin, 14, f"Page {page_number}")
        canvas.restoreState()

    return _draw


def main() -> int:
    parser = argparse.ArgumentParser(description="Export code-focused repository content to a single PDF.")
    parser.add_argument("--output", default=None, help="Output PDF path.")
    parser.add_argument("--scope", default=DEFAULT_SCOPE, help="Export scope. Supported: code-only")
    parser.add_argument("--max-file-mb", default=DEFAULT_MAX_FILE_MB, type=int, help="Max per-file size to include.")
    parser.add_argument(
        "--include-hidden",
        default=str(DEFAULT_INCLUDE_HIDDEN).lower(),
        help="Include hidden files/directories (true/false).",
    )
    parser.add_argument("--root", default=".", help="Repository root path.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if args.scope != DEFAULT_SCOPE:
        print(f"[exportCodePdf] unsupported --scope '{args.scope}'. Use '{DEFAULT_SCOPE}'.", file=sys.stderr)
        return 2

    try:
        include_hidden = parse_bool(args.include_hidden)
    except ValueError as err:
        print(f"[exportCodePdf] {err}", file=sys.stderr)
        return 2

    version = load_package_version(root)
    output_path = Path(args.output).resolve() if args.output else default_output_path(root, version)
    manifest_path = output_path.with_suffix(".manifest.json")
    max_file_bytes = int(args.max_file_mb) * 1024 * 1024

    candidates = gather_candidate_files(root, include_hidden=include_hidden)
    included: list[IncludedFile] = []
    skipped: list[SkippedFile] = []

    for path in candidates:
        rel_path = path.relative_to(root).as_posix()
        try:
            stat = path.stat()
        except OSError as err:
            skipped.append(SkippedFile(rel_path, "stat_error", str(err)))
            continue

        if stat.st_size > max_file_bytes:
            skipped.append(
                SkippedFile(
                    rel_path,
                    "too_large",
                    f"{stat.st_size} bytes exceeds max {max_file_bytes}",
                )
            )
            continue

        try:
            binary, ratio = looks_binary(path)
        except OSError as err:
            skipped.append(SkippedFile(rel_path, "read_error", str(err)))
            continue

        if binary:
            skipped.append(SkippedFile(rel_path, "binary", f"ratio={ratio:.3f}"))
            continue

        try:
            text, encoding = decode_text(path)
        except OSError as err:
            skipped.append(SkippedFile(rel_path, "decode_error", str(err)))
            continue

        included.append(
            IncludedFile(
                path=rel_path,
                abs_path=path,
                size_bytes=stat.st_size,
                modified_at_ms=int(stat.st_mtime * 1000),
                encoding=encoding,
                text=text,
                line_count=max(1, len(text.splitlines())),
            )
        )

    included.sort(key=lambda item: item.path.lower())

    if not included:
        print("[exportCodePdf] no files included after filtering.", file=sys.stderr)
        return 3

    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc_id = output_path.stem
    story = build_story(
        version=version,
        output_path=output_path,
        root=root,
        included=included,
        skipped=skipped,
        include_hidden=include_hidden,
        max_file_mb=args.max_file_mb,
    )

    try:
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=LETTER,
            leftMargin=28,
            rightMargin=28,
            topMargin=30,
            bottomMargin=22,
            title=f"Full App Code Export {version}",
            author="GlassBrowser AI Export Tool",
        )
        draw = on_page(doc_id)
        doc.build(story, onFirstPage=draw, onLaterPages=draw)
    except Exception as err:
        print(f"[exportCodePdf] failed to write pdf: {err}", file=sys.stderr)
        return 4

    skipped_by_reason = Counter(item.reason for item in skipped)
    manifest = {
        "version": version,
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rootPath": str(root),
        "scope": DEFAULT_SCOPE,
        "includeHidden": include_hidden,
        "maxFileMb": int(args.max_file_mb),
        "outputPdf": str(output_path),
        "documentId": doc_id,
        "includedCount": len(included),
        "skippedCount": len(skipped),
        "skippedByReason": dict(sorted(skipped_by_reason.items())),
        "includedFiles": [
            {
                "section": index + 1,
                "path": item.path,
                "sizeBytes": item.size_bytes,
                "lineCount": item.line_count,
                "encoding": item.encoding,
                "modifiedAtMs": item.modified_at_ms,
            }
            for index, item in enumerate(included)
        ],
        "skippedFiles": [
            {
                "path": item.path,
                "reason": item.reason,
                "detail": item.detail,
            }
            for item in skipped
        ],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    size_bytes = output_path.stat().st_size
    print(f"[exportCodePdf] included={len(included)} skipped={len(skipped)}")
    for reason, count in sorted(skipped_by_reason.items()):
        print(f"[exportCodePdf] skipped[{reason}]={count}")
    print(f"[exportCodePdf] output={output_path} size={size_bytes} bytes")
    print(f"[exportCodePdf] manifest={manifest_path}")
    if skipped:
        print("[exportCodePdf] warnings: some files were skipped based on policy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
