# Atlas

Atlas is a reusable marketing agent layer for Hermes Agent. It turns one Hermes instance into a disciplined marketing operator that can learn a brand, follow channel doctrine, compile that doctrine into executable skills, and preserve what it learns in a human-readable vault.

The first profile is Huh?, a Spanish-learning app focused on the moment learners know the words but freeze in real conversation. The same structure is scaffolded for PACO, La Seule Plume, and ooabi.

## What Atlas Is

Atlas is not a new agent framework. It is the layer above Hermes that makes the agent useful for real marketing work:

- A knowledge plane for strategy, brand voice, playbooks, and doctrine.
- An execution plane that compiles selected vault knowledge into Hermes skills.
- A memory plane for learning logs, Hermes memory, and future external memory integrations.

```text
                 Human review
                      |
                      v
+------------------------------------------------+
|                Atlas vault                     |
| doctrine | brands | playbooks | learning log   |
+-----------------------+------------------------+
                        |
                        | compile/sync
                        v
+------------------------------------------------+
|             Hermes execution plane             |
| /opt/data/skills/huh-channel-strategy/SKILL.md |
+-----------------------+------------------------+
                        |
                        | run, observe, learn
                        v
+------------------------------------------------+
|               Memory plane                     |
| Hermes sessions | state db | Atlas learning log|
+------------------------------------------------+
```

## Why It Matters

Most marketing bots are prompt piles. Atlas is designed as an inspectable operating system for brand growth:

- Strategy is versioned in Markdown.
- Skills are generated from readable doctrine.
- Channel rules are explicit, not hidden in chat history.
- Secrets and local runtime data are excluded from the public repo.
- Reusable brand profiles let the same agent serve different products without losing discipline.

## Current Huh? Doctrine

Atlas starts with a sober 90-day acquisition plan:

1. TikTok first.
2. YouTube Shorts and Instagram Reels as native, watermark-free repurposing paths.
3. Reddit only as research and careful founder participation.
4. X ignored as an acquisition engine during the first 90 days.

The creative format is a short faceless screen recording of a real Diego conversation. The hook names the freeze moment immediately, Diego helps with the exact conversation, and the end shows the iOS App Store path clearly.

## Repository Layout

```text
atlas/
|-- docker-compose.yml
|-- vault/
|   |-- 00-doctrine/
|   |-- 01-brands/
|   |-- 02-playbooks/
|   |-- 03-skills-source/
|   `-- 04-memory/
|-- skills/
|   `-- huh-channel-strategy/
|-- scripts/
|   |-- backup-atlas.sh
|   |-- sync-skills.sh
|   `-- verify-no-secrets.sh
`-- docs/
    |-- ARCHITECTURE.md
    |-- HOW-TO-RUN.md
    `-- INTERFACES.md
```

## Safety Model

Atlas is intended to be public. The repo excludes local Hermes data, `.env` files, private keys, auth profiles, and secret-bearing config. Before every commit, run:

```bash
scripts/verify-no-secrets.sh
```

Do not push this repo until the local history and final build report have been reviewed.

## Quick Start

```bash
cd ~/Code/atlas
scripts/verify-no-secrets.sh
scripts/sync-skills.sh
scripts/backup-atlas.sh
```

See [docs/HOW-TO-RUN.md](docs/HOW-TO-RUN.md) for the operator workflow.
