#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

title="${1:-}"
url="${2:-}"

if [[ -z "$title" ]]; then
  echo "Usage: scripts/intake-source.sh \"Source title\" [source-url]" >&2
  echo "Then paste/source content through stdin, or put it on the macOS clipboard." >&2
  exit 2
fi

if [[ ! -t 0 ]]; then
  body="$(cat)"
elif command -v pbpaste >/dev/null 2>&1; then
  body="$(pbpaste || true)"
else
  body=""
fi

if [[ -z "${body//[[:space:]]/}" ]]; then
  echo "No source content found on stdin or clipboard." >&2
  exit 1
fi

args=(text --title "$title")
if [[ -n "$url" ]]; then
  args+=(--url "$url")
fi

printf "%s" "$body" | python3 scripts/atlas-intake-bridge.py "${args[@]}"
