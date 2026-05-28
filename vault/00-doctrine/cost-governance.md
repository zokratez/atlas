# Cost Governance

Atlas must stay cheap by design. Autonomy without spend control is failure.

## Daily Cap

- Hard operating cap: $5/day unless Sam explicitly approves more.
- No background polling loops without written cost justification.
- No scheduled content, research, or monitoring jobs without human approval.
- Prefer reusable doctrine, templates, and human-readable playbooks over repeated model calls.

## Approval Rules

Ask Sam before:

- Installing cron jobs or persistent schedulers.
- Adding paid APIs or paid social spend.
- Connecting Telegram or any external messaging channel that requires a token.
- Expanding beyond the first 90-day Huh? channel focus.

## Evidence Required

Every recurring automation needs:

- Expected frequency.
- Expected model/API cost.
- Failure behavior.
- A stop condition.
- A written owner decision in `SETUP_TODO_FOR_SAM.md` or a tracked decision note.
