#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="${ATLAS_CONTAINER:-hermes-atlas}"
source_dir="$repo_root/skills"
target_dir="/opt/data/skills"

if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo "Container '$container' is not running." >&2
  exit 1
fi

if [[ ! -d "$source_dir" ]]; then
  echo "Missing skills directory: $source_dir" >&2
  exit 1
fi

docker exec "$container" mkdir -p "$target_dir"

shopt -s nullglob
for skill_dir in "$source_dir"/*; do
  [[ -d "$skill_dir" ]] || continue
  docker cp "$skill_dir" "$container:$target_dir/"
done

echo "Skills now present in $container:$target_dir"
docker exec "$container" ls -1 "$target_dir"
