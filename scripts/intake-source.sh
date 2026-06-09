#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
intake_dir="$repo_root/vault/05-intake"

title="${1:-}"
url="${2:-}"

if [[ -z "$title" ]]; then
  echo "Usage: scripts/intake-source.sh \"Source title\" [source-url]" >&2
  echo "Then paste/source content through stdin, or put it on the macOS clipboard." >&2
  exit 2
fi

if [[ ! -d "$intake_dir" ]]; then
  echo "Missing intake directory: $intake_dir" >&2
  exit 1
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

slug="$(printf '%s' "$title" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' \
  | cut -c1-72)"

stamp="$(date +%Y-%m-%d-%H%M)"
file="$intake_dir/${stamp}-${slug:-source}.md"

cat > "$file" <<EOF
# $title

Date captured: $(date +%Y-%m-%d)
Source URL: $url
Source type: TODO
Products possibly relevant: TODO
Who captured it: Sam

## Raw Source / Notes

$body

## Why It Caught Attention

TODO

## What You Want Atlas To Decide

TODO

## Atlas Analysis

Ask Hermes:

\`\`\`text
Use atlas-growth-rd to analyze $file.
Give me the verdict, evidence grade, proof gaps, product fit, cheapest useful test, success metric, and filing recommendation.
\`\`\`
EOF

echo "$file"

