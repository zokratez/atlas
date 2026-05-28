#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "verify-no-secrets: not inside a git repository" >&2
  exit 2
fi

patterns='(sk-ant-[A-Za-z0-9_-]+|xai-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|price_[A-Za-z0-9_]+|acct_[A-Za-z0-9_]+|[0-9]{8,10}:[A-Za-z0-9_-]{30,})'

matches="$(git grep -nIE "$patterns" -- . ':(exclude)scripts/verify-no-secrets.sh' || true)"

if [[ -n "$matches" ]]; then
  echo "Potential secret-like values found in tracked files:" >&2
  echo "$matches" >&2
  exit 1
fi

echo "No secret-like values found in tracked files."
