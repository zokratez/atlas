#!/usr/bin/env bash
set -euo pipefail

container="${ATLAS_CONTAINER:-hermes-atlas}"
backup_root="${ATLAS_BACKUP_ROOT:-$HOME/.atlas-backups}"
stamp="${ATLAS_BACKUP_DATE:-$(date +%Y-%m-%d)}"
dest="$backup_root/$stamp"

if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo "Container '$container' is not running." >&2
  exit 1
fi

mkdir -p "$dest"

backup_paths=()
while IFS= read -r path; do
  backup_paths+=("$path")
done < <(docker exec "$container" sh -lc 'cd /opt/data && for p in skills sessions sessions.db state.db state.db-shm state.db-wal; do [ -e "$p" ] && printf "%s\n" "$p"; done')

if [[ ${#backup_paths[@]} -eq 0 ]]; then
  echo "No Atlas backup paths found in $container:/opt/data" >&2
  exit 1
fi

printf "%s\n" "${backup_paths[@]}" > "$dest/backup-manifest.txt"

tar_paths="${backup_paths[*]}"
docker exec "$container" sh -lc "cd /opt/data && tar -czf - $tar_paths" > "$dest/hermes-data-backup.tgz"

docker exec "$container" ls -1 /opt/data/skills > "$dest/skills-list.txt"

cat > "$dest/README.txt" <<README
Atlas backup created from container: $container
Source paths: ${backup_paths[*]}
Created at: $(date -u +%Y-%m-%dT%H:%M:%SZ)

This backup intentionally excludes .env, auth files, and other secret-bearing local config.
README

echo "Atlas backup written to $dest"
ls -la "$dest"
