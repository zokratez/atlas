# How To Run Atlas

## Start Hermes

```bash
cd ~/Code/atlas
docker compose up -d
```

Hermes runs as container `hermes-atlas`.

Local interfaces:

- Gateway API: `http://127.0.0.1:8642`
- Dashboard: `http://127.0.0.1:9119`

Do not stop or modify unrelated containers such as `open-webui`.

## Verify The Repo Is Safe

Run this before every commit:

```bash
scripts/verify-no-secrets.sh
```

If it fails, remove the secret-like value from tracked files before committing.

## Sync Skills

```bash
scripts/sync-skills.sh
```

The script copies each folder in `skills/` into `hermes-atlas:/opt/data/skills/` and prints the resulting skill list.

## Back Up Atlas Runtime State

```bash
scripts/backup-atlas.sh
```

Backups are written to:

```text
~/.atlas-backups/<date>/
```

The backup includes skills, sessions, and Hermes state database files. It intentionally excludes `.env`, auth files, and secret-bearing local config.

## Normal Operator Loop

1. Write or update strategy in `vault/`.
2. Convert reusable strategy into a skill under `vault/03-skills-source/`.
3. Mirror the compiled skill into `skills/`.
4. Run the secret scanner.
5. Sync skills into Hermes.
6. Test the agent's output.
7. Record validated learning in `vault/04-memory/learning-log.md`.
8. Commit one coherent change.

## Growth R&D Loop

Use this when Sam finds an article, video, thread, customer quote, content idea, competitor move, ad, or tactic.

1. Save the source in `vault/05-intake/` or run `scripts/intake-source.sh "Source title" "https://source-url-if-any"` to capture clipboard/stdin.
2. In Hermes dashboard, ask: `Use atlas-growth-rd to analyze vault/05-intake/<file>.`
3. Require an evidence grade, proof gaps, product fit, cheapest test, and next action.
4. Move the result to:
   - `vault/06-opportunities/`
   - `vault/07-validated/`
   - `vault/08-experiments/`
   - `vault/09-swipe-file/`
5. If the lesson proves out, add it to `vault/04-memory/learning-log.md`.

Atlas may analyze and recommend. It may not run autonomous scraping, spend money, post content, or schedule loops without Sam's explicit approval.

For the full controlled loop and Telegram workflow, read `docs/LOOP-OPERATING-MANUAL.md`.

## Human-Only Setup

Sam must handle anything requiring a token, account owner action, or persistent scheduler approval. Those items live in `SETUP_TODO_FOR_SAM.md`.
