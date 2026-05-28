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

Telegram is not wired by default because it requires a BotFather token and user allowlist. Those are secrets and must stay out of tracked files.

When Sam approves Telegram:

1. Create the bot token outside this repo.
2. Store it in local Hermes secret config, not git.
3. Pair Hermes from inside the container.
4. Add the decision and verification notes to `SETUP_TODO_FOR_SAM.md` or a tracked decision note without exposing the token.

## Choosing An Interface

- Use terminal when correctness matters.
- Use dashboard when shaping agent behavior.
- Use gateway when another local system needs Atlas.
- Use Telegram only after the security and cost boundaries are explicit.
