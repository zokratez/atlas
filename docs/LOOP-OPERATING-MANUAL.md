# Atlas Loop Operating Manual

This file turns the "design loops that prompt agents" idea into an Atlas operating system.

The goal is not an infinite bot. The goal is a controlled loop:

```text
intake -> analyze with skill -> file -> propose experiment -> verify -> learn -> stop
```

## Current State

Atlas already has:

- Hermes dashboard: `http://127.0.0.1:9119`
- Hermes gateway: `http://127.0.0.1:8642`
- Telegram DM connected to Sam.
- Growth R&D skill synced into Hermes: `atlas-growth-rd`.
- Loop operator skill synced into Hermes: `atlas-loop-operator`.
- Existing monthly cron example: Huh? benchmark refresh.

## Important Constraint

The Hermes container currently mounts:

```text
./hermes-data -> /opt/data
```

It does **not** mount the Atlas repo vault. That means:

- Dashboard/Telegram can analyze and reply.
- Local terminal can save files into `vault/`.
- Durable vault filing from Telegram requires either manual copy-back or a future approved bridge/mount.

Do not pretend Telegram analysis is automatically committed to the Atlas vault until that bridge exists.

## Where To Dump Research

On the Mac, put raw sources here:

```text
/Users/samoteo/Code/atlas/vault/05-intake/
```

Use this naming pattern:

```text
YYYY-MM-DD-HHMM-short-source-title.md
```

Fast path from clipboard:

```bash
cd ~/Code/atlas
scripts/intake-source.sh "Source title" "https://source-url-if-any"
```

Fast path from a file:

```bash
cd ~/Code/atlas
cat /path/to/source.txt | scripts/intake-source.sh "Source title" "https://source-url-if-any"
```

## Dashboard Workflow

1. Open `http://127.0.0.1:9119`.
2. Paste:

```text
Use atlas-growth-rd to analyze vault/05-intake/<filename>. Give me the verdict, evidence grade, proof gaps, product fit, cheapest useful test, success metric, and filing recommendation.
```

3. Move the result to one of:

```text
vault/06-opportunities/
vault/07-validated/
vault/08-experiments/
vault/09-swipe-file/
```

4. If it becomes a reusable truth, update:

```text
vault/04-memory/learning-log.md
```

## Telegram Workflow

Use Telegram when you are away from the computer.

Send Hermes a message like:

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

If Hermes says it is worth saving, later on the Mac:

```bash
cd ~/Code/atlas
scripts/intake-source.sh "Source title" "https://source-url-if-any"
```

Then paste the Telegram analysis into the intake file under `## Atlas Analysis`.

## Loop Workflow

Use this when you want Atlas to process a folder of intake files.

Prompt Hermes:

```text
Use atlas-loop-operator.

Run a bounded Growth R&D intake pass.
Input folder: vault/05-intake/
Max files: 5
Max iterations: 5
Budget: no paid APIs beyond the current Hermes model call.
Stop if no file has enough information to analyze.

For each file:
- use atlas-growth-rd
- assign evidence grade
- recommend file destination
- propose one cheapest useful test if grade is A/B/C
- reject D/F ideas clearly

Return a queue report. Do not spend money. Do not schedule anything. Do not post anywhere.
```

## Loop Guardrails

Every loop must define:

- input folder/source,
- skill(s) to call,
- max files,
- max iterations,
- max spend or explicit "no new paid APIs",
- stop condition,
- output folder/report,
- human approval point.

No loop ships without those.

## Approved Autonomy Levels

Level 0: manual analysis in dashboard or Telegram.

Level 1: bounded local batch over existing intake files.

Level 2: scheduled low-frequency review of already-saved files.

Level 3: external scraping/research with explicit target list, budget, and legal/platform review.

Current approved level: **Level 0 / Level 1 only**.

Do not install new cron jobs or external scrapers until Sam approves.

## Verification

Before committing Atlas changes:

```bash
cd ~/Code/atlas
scripts/verify-no-secrets.sh
scripts/sync-skills.sh
git status --short
```

## Failure Modes

- Infinite loop: max iterations missing.
- Cost spike: budget missing.
- Garbage memory: everything saved without evidence grade.
- Context rot: Telegram answer not copied into vault.
- False proof: viral source accepted without denominator.
- Legal/platform risk: scraping started without approval.

