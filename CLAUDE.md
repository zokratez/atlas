# Atlas — Hermes Agent Install
**Sam Oteo / ooabi LLC**
**Installed:** 2026-05-26

## What This Is

Atlas is the marketing automation harness for **Huh? Learn Spanish** and adjacent ooabi brands.
It runs **Hermes Agent** (NousResearch) via Docker, configured against Anthropic Claude Sonnet 4.6.

## Architecture

- **Runtime:** Docker container — image `nousresearch/hermes-agent:latest`
- **Data directory:** `~/Code/atlas/hermes-data/` (mapped to `/opt/data` inside container)
- **Gateway API:** `localhost:8642`
- **Dashboard:** `localhost:9119` (bind: `127.0.0.1` only)
- **Model:** `claude-sonnet-4-6` via Anthropic native provider
- **Telegram:** Not wired yet — add `TELEGRAM_BOT_TOKEN` to `hermes-data/.env` when ready

## Cost Discipline

- **Hard cap:** $5/day API spend. No background polling loops. No token-burning automations.
- Every skill that calls the model must have an explicit cost justification.
- OpenClaw burned $28 in 4 days from uncontrolled background agents. This does not repeat.

## Model Abstraction

Provider and model string live in `hermes-data/config.yaml`. To swap models:
1. Edit `model.default` in config.yaml
2. `docker compose restart hermes`

No code changes required. The harness is model-agnostic.

## Brutal Honesty Principle

Never claim a skill is "done" without evidence it ran correctly.
Never mark an automation as working without a log showing successful execution.
"It should work" is not evidence.

## Agents (Planned — Not Yet Created)

These are **skills** inside a single Hermes agent, not separate containers:

| Name  | Role |
|-------|------|
| Scout | Market/competitor research |
| Quill | Content drafting (X, IG, App Store copy) |
| Buzz  | Influencer/press outreach |
| Boost | ASO and paid acquisition analysis |

Skills live in `hermes-data/skills/` once created.

## Do Not Touch

- `hermes-data/.env` — secrets, never commit
- `hermes-data/` — persistent data volume, never delete without backup
- Running multiple gateway containers against the same `hermes-data/` simultaneously

## Next Steps

1. Wire Telegram: get a bot token from @BotFather, add to `hermes-data/.env` as `TELEGRAM_BOT_TOKEN`
2. Run `hermes gateway setup` from inside the container to pair the bot
3. Create Scout, Quill, Buzz, Boost skills in `hermes-data/skills/`
4. Set up cron schedules for recurring automations
