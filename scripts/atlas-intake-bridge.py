#!/usr/bin/env python3
"""Atlas durable intake bridge.

This script has two jobs:

1. Hermes pre_llm_call hook mode:
   - Detect source-like messages from dashboard/Telegram.
   - Save the raw source as a dated Markdown file in vault/05-intake.
   - Inject instructions so the current Hermes turn analyzes the saved file
     with atlas-growth-rd and appends the analysis back into that file.

2. Local file mode:
   - Normalize dropped files or stdin into the same dated Markdown template.

It intentionally does not start scrapers, background jobs, or paid API calls.
URL fetching uses ordinary HTTP best effort only when a URL is explicitly
provided by Sam.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html.parser
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VAULT = Path(os.environ.get("ATLAS_VAULT_DIR", REPO_ROOT / "vault"))
INTAKE_DIR = DEFAULT_VAULT / "05-intake"
MAX_FETCH_CHARS = 120_000
MAX_SOURCE_CHARS = 180_000
URL_RE = re.compile(r"https?://[^\s<>)\"']+", re.IGNORECASE)


class TextExtractor(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag in {"p", "br", "li", "h1", "h2", "h3", "article", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if tag in {"p", "li", "h1", "h2", "h3", "article", "section"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        raw = " ".join(self.parts)
        raw = re.sub(r"\s*\n\s*", "\n", raw)
        raw = re.sub(r"[ \t]{2,}", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return (slug or "source")[:72]


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d-%H%M")


def today() -> str:
    return dt.date.today().isoformat()


def infer_title(text: str, url: str = "") -> str:
    first_line = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break
    if first_line:
        first_line = re.sub(r"^#+\s*", "", first_line)
        return first_line[:90]
    if url:
        cleaned = re.sub(r"^https?://", "", url).strip("/")
        return cleaned[:90] or "Atlas intake source"
    return "Atlas intake source"


def ensure_intake_dir() -> None:
    INTAKE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_url(url: str) -> tuple[str, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AtlasIntakeBridge/1.0 (+local Sam-approved on-demand fetch)",
            "Accept": "text/html,text/plain,application/xhtml+xml,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            content_type = resp.headers.get("content-type", "")
            data = resp.read(MAX_FETCH_CHARS)
    except urllib.error.URLError as exc:
        return "", f"URL fetch failed: {exc}"

    charset = "utf-8"
    match = re.search(r"charset=([^;]+)", content_type, re.IGNORECASE)
    if match:
        charset = match.group(1).strip()
    raw = data.decode(charset, errors="replace")

    if "html" in content_type.lower() or "<html" in raw[:500].lower():
        parser = TextExtractor()
        parser.feed(raw)
        text = parser.text()
    else:
        text = raw.strip()

    return text[:MAX_FETCH_CHARS], f"Fetched URL with content-type: {content_type or 'unknown'}"


def run_local_extractors(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    mime, _ = mimetypes.guess_type(path.name)

    if suffix in {".md", ".txt", ".csv", ".json", ".log"}:
        return path.read_text(errors="replace")[:MAX_SOURCE_CHARS], "Read local text file."

    if suffix == ".pdf":
        pdftotext = shutil.which("pdftotext")
        if pdftotext:
            result = subprocess.run(
                [pdftotext, "-layout", str(path), "-"],
                check=False,
                text=True,
                capture_output=True,
                timeout=60,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout[:MAX_SOURCE_CHARS], "Extracted PDF text with local pdftotext."
            return "", f"pdftotext failed: {result.stderr.strip()[:500]}"
        return "", "PDF text extraction unavailable: local pdftotext is not installed."

    if mime and mime.startswith("image/"):
        tesseract = shutil.which("tesseract")
        if tesseract:
            result = subprocess.run(
                [tesseract, str(path), "stdout"],
                check=False,
                text=True,
                capture_output=True,
                timeout=60,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout[:MAX_SOURCE_CHARS], "Extracted image text with local tesseract OCR."
            return "", f"tesseract OCR failed: {result.stderr.strip()[:500]}"
        return "", "Image OCR unavailable: local tesseract is not installed. No paid vision API was called."

    return "", f"Unsupported file type for local parsing: {suffix or mime or 'unknown'}"


def build_markdown(
    *,
    title: str,
    source_url: str = "",
    source_type: str,
    raw_source: str,
    extracted_text: str = "",
    parser_note: str = "",
    captured_from: str,
) -> str:
    extracted_section = ""
    if extracted_text.strip() and extracted_text.strip() != raw_source.strip():
        extracted_section = f"""
## Extracted / Parsed Text

{extracted_text.strip()}
"""

    parser_note = parser_note or "No parser note."
    raw_source = raw_source.strip() or "(No raw text captured.)"
    return f"""# {title}

Date captured: {today()}
Source URL: {source_url}
Source type: {source_type}
Captured from: {captured_from}
Products possibly relevant: TODO
Who captured it: Sam
Processing status: saved_for_atlas_growth_rd

## Parser Note

{parser_note}

## Raw Source / Notes

{raw_source[:MAX_SOURCE_CHARS]}
{extracted_section}
## Why It Caught Attention

TODO

## What You Want Atlas To Decide

Validate whether this is a proven marketing/customer/acquisition idea worth testing.

## Atlas Analysis

Pending. Atlas should use `atlas-growth-rd`, then append verdict, evidence grade, proof gaps, product fit, cheapest useful test, success metric, and filing recommendation here.
"""


def save_intake(
    *,
    title: str,
    raw_source: str,
    source_url: str = "",
    source_type: str = "text",
    extracted_text: str = "",
    parser_note: str = "",
    captured_from: str,
) -> Path:
    ensure_intake_dir()
    base = INTAKE_DIR / f"{now_stamp()}-{slugify(title)}.md"
    path = base
    i = 2
    while path.exists():
        path = base.with_name(f"{base.stem}-{i}{base.suffix}")
        i += 1

    path.write_text(
        build_markdown(
            title=title,
            source_url=source_url,
            source_type=source_type,
            raw_source=raw_source,
            extracted_text=extracted_text,
            parser_note=parser_note,
            captured_from=captured_from,
        )
    )
    return path


def hermes_path_for(path: Path) -> str:
    try:
        rel = path.relative_to(DEFAULT_VAULT)
        return f"/opt/atlas/vault/{rel.as_posix()}"
    except ValueError:
        return str(path)


def is_source_like(message: str) -> bool:
    stripped = message.strip()
    lowered = stripped.lower()
    if not stripped:
        return False
    triggers = [
        "atlas intake",
        "use atlas-growth-rd",
        "source:",
        "analyze this",
        "dissect this",
        "research:",
    ]
    if any(t in lowered for t in triggers):
        return True
    if URL_RE.search(stripped):
        return True
    return len(stripped) >= 450


def clean_message_source(message: str) -> tuple[str, str, str, str]:
    urls = URL_RE.findall(message)
    url = urls[0] if urls else ""
    fetched = ""
    parser_note = "Captured raw pasted text."
    source_type = "text"

    if url:
        fetched, fetch_note = fetch_url(url)
        parser_note = fetch_note
        source_type = "url"

    body = message.strip()
    extracted = fetched.strip()
    title = infer_title(body, url)
    return title, url, source_type, parser_note + ("\n\nURL text was parsed best-effort; JS-heavy sites like X may require pasted thread text too." if url else ""), extracted


def hook_mode() -> int:
    payload = json.load(sys.stdin)
    extra: dict[str, Any] = payload.get("extra") or {}
    message = str(extra.get("user_message") or "")
    platform = str(extra.get("platform") or "hermes")
    session_id = str(payload.get("session_id") or "")

    if not is_source_like(message):
        print("{}")
        return 0

    title, url, source_type, parser_note, extracted = clean_message_source(message)
    path = save_intake(
        title=title,
        raw_source=message,
        source_url=url,
        source_type=source_type,
        extracted_text=extracted,
        parser_note=parser_note,
        captured_from=f"hermes:{platform}:{session_id}",
    )
    rel = path.relative_to(DEFAULT_VAULT)
    container_path = f"/opt/atlas/vault/{rel.as_posix()}"
    context = f"""
ATLAS DURABLE INTAKE BRIDGE

The source Sam just sent has already been saved as durable memory before analysis:

{container_path}

Use the `atlas-growth-rd` skill now. Analyze that saved intake file, not only the chat text.

Required output:
1. verdict
2. evidence grade
3. proof gaps
4. product fit
5. cheapest useful test
6. success metric
7. filing recommendation

Also append the final analysis to the saved file under `## Atlas Analysis`.

Guardrails:
- Do not scrape beyond the explicit URL/text Sam provided.
- Do not start scheduled jobs.
- Do not use any new paid API. If PDF/image/OCR/vision is needed and local extraction is unavailable, say what is missing instead of inventing it.
"""
    print(json.dumps({"context": textwrap.dedent(context).strip()}, ensure_ascii=False))
    return 0


def save_text_mode(args: argparse.Namespace) -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("No stdin text provided.")
    title = args.title or infer_title(raw, args.url or "")
    extracted = ""
    note = "Captured stdin text."
    source_type = "text"
    if args.url:
        extracted, fetch_note = fetch_url(args.url)
        note = f"{note}\n{fetch_note}"
        source_type = "url"
    path = save_intake(
        title=title,
        raw_source=raw,
        source_url=args.url or "",
        source_type=source_type,
        extracted_text=extracted,
        parser_note=note,
        captured_from="local:stdin",
    )
    print(path)
    print(f"Prompt Hermes: Use atlas-growth-rd to analyze {hermes_path_for(path)}. Append the analysis under ## Atlas Analysis.")
    return 0


def save_file_mode(args: argparse.Namespace) -> int:
    source = Path(args.file).expanduser().resolve()
    if not source.exists():
        raise SystemExit(f"File not found: {source}")

    text, note = run_local_extractors(source)
    title = args.title or infer_title(text, source.name)
    source_type = source.suffix.lower().lstrip(".") or "file"
    raw = f"Local file: {source}\n\n{text}".strip()
    path = save_intake(
        title=title,
        raw_source=raw,
        source_url=args.url or "",
        source_type=source_type,
        extracted_text=text,
        parser_note=note,
        captured_from="local:file-drop",
    )
    print(path)
    print(f"Prompt Hermes: Use atlas-growth-rd to analyze {hermes_path_for(path)}. Append the analysis under ## Atlas Analysis.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas durable intake bridge")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("hook", help="Hermes pre_llm_call hook mode")

    text_p = sub.add_parser("text", help="Save stdin text into vault/05-intake")
    text_p.add_argument("--title", default="")
    text_p.add_argument("--url", default="")

    file_p = sub.add_parser("file", help="Normalize a dropped file into vault/05-intake")
    file_p.add_argument("file")
    file_p.add_argument("--title", default="")
    file_p.add_argument("--url", default="")

    args = parser.parse_args()
    if args.cmd == "hook":
        return hook_mode()
    if args.cmd == "text":
        return save_text_mode(args)
    if args.cmd == "file":
        return save_file_mode(args)
    raise SystemExit(f"Unknown command: {args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main())
