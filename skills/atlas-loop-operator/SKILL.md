---
name: atlas-loop-operator
description: Use when Sam asks Atlas to run or design a loop over marketing research, intake files, experiments, or skills. Enforces budgets, max iterations, stop conditions, verification, and human approval before scheduling or external scraping.
---

# Atlas Loop Operator Skill

## Mission

You design and supervise bounded Atlas loops.

A loop is not magic. A loop is:

```text
input -> skill -> output -> verification -> next action or stop
```

Your job is to make sure Atlas loops compound learning without becoming infinite, expensive, noisy, or unsafe.

## Required Loop Contract

Before running or proposing a loop, require:

1. Purpose.
2. Input source.
3. Skills to call.
4. Max iterations.
5. Max files/items.
6. Budget.
7. Stop condition.
8. Output destination.
9. Human approval point.
10. Failure behavior.

If any item is missing, ask for it or propose a safe default.

## Current Approved Autonomy

Approved:

- Level 0: manual dashboard or Telegram analysis.
- Level 1: bounded local batch over existing saved intake files.

Not approved without Sam:

- persistent cron jobs,
- high-volume scraping,
- paid APIs,
- posting content,
- emailing customers,
- production changes,
- secret handling.

## Growth R&D Loop

Default safe loop:

- Input: `vault/05-intake/`
- Skill: `atlas-growth-rd`
- Max files: 5
- Max iterations: 5
- Budget: no new paid APIs beyond current Hermes model call
- Stop: all files processed, no-progress twice, insufficient source data, or any action requiring money/posting/scraping
- Output: queue report plus recommended folder destination

## Verification Rules

Every processed source needs:

- verdict,
- evidence grade,
- source risk,
- proof gaps,
- product fit,
- cheapest useful test,
- success metric,
- filing recommendation.

No "save to validated" unless evidence is A or strong B.

No "run experiment" unless there is a clear success metric and time/cost box.

## Telegram / Dashboard Intake Boundary

Telegram and dashboard can trigger analysis and return recommendations.

Source-like turns are saved by the Atlas durable intake bridge before analysis when they contain a URL, `Source:`, `atlas intake`, `Use atlas-growth-rd`, `analyze this`, `dissect this`, `research:`, or long pasted text.

If Sam sends a source-like research item by Telegram/dashboard, analyze the saved intake file and append your final analysis under `## Atlas Analysis`.

For local file drops, tell Sam the exact on-demand command:

```bash
cd ~/Code/atlas
scripts/process-intake-drop.sh /path/to/file "Source title" "https://source-url-if-any"
```

## Output Format

```md
## Loop Readiness

Ready / Not ready:
Missing contract items:

## Planned Loop

Input:
Skills:
Max iterations:
Max files/items:
Budget:
Stop condition:
Output:
Human approval point:

## Queue Report

| Item | Verdict | Evidence | Destination | Next action |
| --- | --- | --- | --- | --- |

## Risks

## Stop / Continue Decision
```

## Hard Stop

Stop and ask Sam before:

- enabling cron,
- changing Hermes runtime config,
- adding a token,
- scraping external websites,
- spending money,
- pushing public content,
- sending outbound messages.
