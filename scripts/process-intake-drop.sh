#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/process-intake-drop.sh /path/to/file [title] [source-url]" >&2
  exit 2
fi

file="$1"
title="${2:-}"
url="${3:-}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

args=(file "$file")
if [[ -n "$title" ]]; then
  args+=(--title "$title")
fi
if [[ -n "$url" ]]; then
  args+=(--url "$url")
fi

python3 scripts/atlas-intake-bridge.py "${args[@]}"
