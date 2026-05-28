# Atlas Build Report

Date: 2026-05-27
Executor: Codex
Repo path: `/Users/samoteo/Code/atlas`
GitHub push: not performed

## Outcome

Atlas is built as a public, secrets-safe Hermes Agent knowledge and execution layer.

Completed:

- Hardened `.gitignore` before adding new Atlas build content.
- Added and ran `scripts/verify-no-secrets.sh` before every commit made during this build.
- Built the Obsidian-style `vault/` with doctrine, Huh? strategy, playbooks, scaffolds, and learning log.
- Compiled `huh-channel-strategy` into Hermes skill format.
- Synced the compiled skill into `hermes-atlas:/opt/data/skills/`.
- Added and tested a dated Atlas backup script.
- Wrote public showcase docs and MIT license.
- Created Linear project `Atlas Build` and phase issues `SAM-38` through `SAM-43`.

## Commits Created

```text
5914f48 docs: add atlas showcase documentation
efde475 feat: add atlas backup script
356e01d feat: add huh channel strategy skill
9fef70e docs: add huh marketing vault
7ed6a9e docs: add atlas operator doctrine
43479bd chore: initialize atlas repo with secrets-safe gitignore
```

Existing before this build:

```text
815f1fd feat: initial Atlas install with Hermes Agent v1
```

## Files Created Or Updated

```text
.gitignore
LICENSE
README.md
SETUP_TODO_FOR_SAM.md
BUILD_REPORT.md
docs/ARCHITECTURE.md
docs/HOW-TO-RUN.md
docs/INTERFACES.md
scripts/backup-atlas.sh
scripts/sync-skills.sh
scripts/verify-no-secrets.sh
skills/huh-channel-strategy/SKILL.md
vault/00-doctrine/communication-rules.md
vault/00-doctrine/cost-governance.md
vault/00-doctrine/operator-principles.md
vault/01-brands/huh/brand-voice.md
vault/01-brands/huh/channel-strategy.md
vault/01-brands/huh/content-pillars.md
vault/01-brands/huh/never-do.md
vault/01-brands/huh/posting-cadence.md
vault/01-brands/lsp/brand-voice.md
vault/01-brands/lsp/channel-strategy.md
vault/01-brands/lsp/content-pillars.md
vault/01-brands/lsp/never-do.md
vault/01-brands/lsp/posting-cadence.md
vault/01-brands/ooabi/brand-voice.md
vault/01-brands/ooabi/channel-strategy.md
vault/01-brands/ooabi/content-pillars.md
vault/01-brands/ooabi/never-do.md
vault/01-brands/ooabi/posting-cadence.md
vault/01-brands/paco/brand-voice.md
vault/01-brands/paco/channel-strategy.md
vault/01-brands/paco/content-pillars.md
vault/01-brands/paco/never-do.md
vault/01-brands/paco/posting-cadence.md
vault/02-playbooks/cross-post-workflow.md
vault/02-playbooks/reddit-scalpel.md
vault/02-playbooks/tiktok-faceless-diego-demo.md
vault/03-skills-source/huh-channel-strategy/SKILL.md
vault/04-memory/learning-log.md
```

Existing files preserved:

```text
CLAUDE.md
docker-compose.yml
```

Ignored local/private paths confirmed:

```text
.claude/
hermes-data/
```

## Verification Results

Secret scanner:

```text
No secret-like values found in tracked files.
```

Git status before writing this report:

```text
!! .claude/
!! hermes-data/
```

Hermes skill sync verification:

```text
huh-channel-strategy
huh-first-post
```

The full container skill listing also included bundled Hermes skills. `huh-channel-strategy` appeared in `/opt/data/skills/` after running `scripts/sync-skills.sh`.

Backup verification:

```text
Backup folder: /Users/samoteo/.atlas-backups/2026-05-27/
Files: README.txt, backup-manifest.txt, hermes-data-backup.tgz, skills-list.txt
Manifest: skills, sessions, state.db, state.db-shm, state.db-wal
```

Container status at final check:

```text
hermes-atlas Up 23 hours 127.0.0.1:8642->8642/tcp, 127.0.0.1:9119->9119/tcp
open-webui Up 24 hours (healthy) 0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp
```

No GitHub push was performed.

## Command Log

Shell commands and scripts used during the build:

```bash
sed -n '1,220p' /Users/samoteo/.codex/plugins/cache/openai-curated/linear/c0d3e0eb/skills/linear/SKILL.md
pwd
ls -la /Users/samoteo/Code/atlas
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
ls -la /Users/samoteo/ooabisabi-memory
cat /Users/samoteo/Code/atlas/.gitignore
cat /Users/samoteo/Code/atlas/README.md
cat /Users/samoteo/Code/atlas/docker-compose.yml
cat /Users/samoteo/Code/atlas/CLAUDE.md
git -C /Users/samoteo/Code/atlas status --short
git -C /Users/samoteo/Code/atlas log --oneline --max-count=5
mkdir -p /Users/samoteo/Code/atlas/scripts
chmod +x /Users/samoteo/Code/atlas/scripts/verify-no-secrets.sh
/Users/samoteo/Code/atlas/scripts/verify-no-secrets.sh
git -C /Users/samoteo/Code/atlas status --short --ignored
git -C /Users/samoteo/Code/atlas add .gitignore scripts/verify-no-secrets.sh
git -C /Users/samoteo/Code/atlas commit -m "chore: initialize atlas repo with secrets-safe gitignore"
cat /Users/samoteo/ooabisabi-memory/Instructions.md
cat /Users/samoteo/ooabisabi-memory/CLAUDE.md
find /Users/samoteo/Code/atlas -maxdepth 3 -type f -not -path '*/.git/*' -not -path '*/hermes-data/*' -print | sort
mkdir -p /Users/samoteo/Code/atlas/vault/00-doctrine /Users/samoteo/Code/atlas/vault/01-brands/huh /Users/samoteo/Code/atlas/vault/01-brands/paco /Users/samoteo/Code/atlas/vault/01-brands/lsp /Users/samoteo/Code/atlas/vault/01-brands/ooabi /Users/samoteo/Code/atlas/vault/02-playbooks /Users/samoteo/Code/atlas/vault/03-skills-source/huh-channel-strategy /Users/samoteo/Code/atlas/vault/04-memory
git -C /Users/samoteo/Code/atlas add vault/00-doctrine/operator-principles.md vault/00-doctrine/communication-rules.md vault/00-doctrine/cost-governance.md
git -C /Users/samoteo/Code/atlas commit -m "docs: add atlas operator doctrine"
find /Users/samoteo/Code/atlas/vault -type f -print | sort
git -C /Users/samoteo/Code/atlas add SETUP_TODO_FOR_SAM.md vault/01-brands vault/02-playbooks vault/04-memory/learning-log.md
git -C /Users/samoteo/Code/atlas commit -m "docs: add huh marketing vault"
find /Users/samoteo/Code/atlas/skills -maxdepth 3 -type f -print -exec sed -n '1,80p' {} \;
mkdir -p /Users/samoteo/Code/atlas/vault/03-skills-source/huh-channel-strategy /Users/samoteo/Code/atlas/skills/huh-channel-strategy
cp /Users/samoteo/Code/atlas/vault/03-skills-source/huh-channel-strategy/SKILL.md /Users/samoteo/Code/atlas/skills/huh-channel-strategy/SKILL.md
chmod +x /Users/samoteo/Code/atlas/scripts/sync-skills.sh
/Users/samoteo/Code/atlas/scripts/sync-skills.sh
git -C /Users/samoteo/Code/atlas add vault/03-skills-source/huh-channel-strategy/SKILL.md skills/huh-channel-strategy/SKILL.md scripts/sync-skills.sh
git -C /Users/samoteo/Code/atlas commit -m "feat: add huh channel strategy skill"
docker exec hermes-atlas sh -lc 'find /opt/data -maxdepth 3 \( -name sessions.db -o -path /opt/data/skills -o -path /opt/data/sessions \) -print'
docker exec hermes-atlas sh -lc 'ls -la /opt/data && find /opt/data -maxdepth 4 -type f | sed -n "1,120p"'
chmod +x /Users/samoteo/Code/atlas/scripts/backup-atlas.sh
/Users/samoteo/Code/atlas/scripts/backup-atlas.sh
cat /Users/samoteo/Code/atlas/scripts/backup-atlas.sh
python3 - <<'PY'
cat /Users/samoteo/.atlas-backups/2026-05-27/backup-manifest.txt
git -C /Users/samoteo/Code/atlas add scripts/backup-atlas.sh SETUP_TODO_FOR_SAM.md
git -C /Users/samoteo/Code/atlas commit -m "feat: add atlas backup script"
mkdir -p /Users/samoteo/Code/atlas/docs
LC_ALL=C grep -RIn '[^ -~]' /Users/samoteo/Code/atlas/README.md /Users/samoteo/Code/atlas/docs /Users/samoteo/Code/atlas/LICENSE || true
perl -0pi -e "replace non-ASCII tree glyphs with ASCII tree markers" README.md docs/ARCHITECTURE.md
git -C /Users/samoteo/Code/atlas add README.md LICENSE docs/ARCHITECTURE.md docs/HOW-TO-RUN.md docs/INTERFACES.md
git -C /Users/samoteo/Code/atlas commit -m "docs: add atlas showcase documentation"
git -C /Users/samoteo/Code/atlas log --oneline --max-count=10
git -C /Users/samoteo/Code/atlas ls-files | sort
cat /Users/samoteo/Code/atlas/SETUP_TODO_FOR_SAM.md
```

Linear connector actions:

```text
Created project: Atlas Build
Created phase issues: SAM-38, SAM-39, SAM-40, SAM-41, SAM-42, SAM-43
Marked phases done as completed.
```

## SETUP_TODO_FOR_SAM.md Contents

```markdown
# Setup TODO for Sam

Items that require a human decision, a secret, or account-owner action.

- Create the GitHub remote `zokratez/atlas` and push after review.
- Confirm the Huh? channel-strategy doctrine reads correctly.
- Decide whether to install a cron job for Atlas backups. Codex should not install cron without approval.
  Suggested daily cron, only after approval:
  `17 3 * * * /Users/samoteo/Code/atlas/scripts/backup-atlas.sh >> /Users/samoteo/.atlas-backups/backup.log 2>&1`
- Connect Telegram only after creating a BotFather token and storing it outside tracked files.
- Add free-tier model/API keys to the fallback chain only through local secret storage, never tracked files.
```

## Remaining Items For Sam

- Review the repo and build report.
- Confirm the Huh? doctrine reads correctly.
- Create the GitHub remote `zokratez/atlas`.
- Push only after review.
- Decide whether to install the backup cron.
- Provide any future Telegram/model keys through local secret storage only.
