# Interfaces

Atlas can be operated through three surfaces: terminal, dashboard, and future Telegram.

## Terminal

Best for setup, verification, backups, git history, and deterministic operations.

Use terminal for:

- Running `scripts/verify-no-secrets.sh`.
- Running `scripts/sync-skills.sh`.
- Running `scripts/backup-atlas.sh`.
- Inspecting git status before commits.
- Starting or checking the Hermes container.

## Dashboard

Best for interactive Hermes sessions and manual inspection.

Local URL:

```text
http://127.0.0.1:9119
```

Use the dashboard to ask Atlas for marketing drafts, critique hooks, apply Huh? channel doctrine, and inspect whether the loaded skill changes behavior.

## Gateway API

Best for programmatic calls from another local tool.

Local URL:

```text
http://127.0.0.1:8642
```

Use the gateway when Atlas becomes part of a larger workflow, but keep scheduled calls behind explicit cost governance.

## Telegram

Telegram is connected in the local Hermes runtime as of 2026-06-08. The token and runtime config live in ignored `hermes-data/` and must stay out of tracked files.

Use Telegram for quick analysis when Sam is away from the computer:

```text
Use atlas-growth-rd.

Source: [paste link or text]

Tell me:
1. verdict
2. evidence grade
3. proof gaps
4. product fit
5. cheapest useful test
6. whether this should become an Atlas intake file
```

Important: Telegram analysis does not automatically write to the Atlas git vault. To save durable memory, copy the source/analysis into `vault/05-intake/` later or use `scripts/intake-source.sh` on the Mac.

When maintaining Telegram:

1. Create the bot token outside this repo.
2. Store it in local Hermes secret config, not git.
3. Pair Hermes from inside the container.
4. Add the decision and verification notes to `SETUP_TODO_FOR_SAM.md` or a tracked decision note without exposing the token.

## Choosing An Interface

- Use terminal when correctness matters.
- Use dashboard when shaping agent behavior.
- Use gateway when another local system needs Atlas.
- Use Telegram for quick capture/triage, then file durable decisions into the vault.
