# Growth R&D Intake Loop

Status: draft / manual only
Approved autonomy level: Level 0 / Level 1
Owner: Sam

## Purpose

Process saved marketing sources and turn them into proof-checked opportunities, experiments, swipe-file entries, or rejections.

## Input

```text
vault/05-intake/
```

## Skills

- `atlas-loop-operator`
- `atlas-growth-rd`

## Max Iterations

5 per run.

## Max Files

5 intake files per run.

## Budget

No new paid APIs beyond the current Hermes model call.

No external scraping unless Sam explicitly approves a Level 3 loop.

## Stop Conditions

- all selected files processed,
- max iterations reached,
- no file has enough information to analyze,
- repeated no-progress after 2 attempts,
- any request would require spending money, posting, emailing, or scraping.

## Output

One queue report that recommends moving each item to:

- `vault/06-opportunities/`
- `vault/07-validated/`
- `vault/08-experiments/`
- `vault/09-swipe-file/`
- remain in intake as rejected/needs-more-info

## Human Approval

Sam approves before:

- moving a strategy into an experiment,
- scheduling a cron job,
- scraping external sites,
- spending money,
- posting content,
- emailing customers.

## Prompt

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

