# Atlas — Hermes Agent

Marketing automation harness for **Huh? Learn Spanish** and adjacent ooabi brands.

## Status: Running

| Component | URL | Status |
|-----------|-----|--------|
| Dashboard | http://127.0.0.1:9119 | Live (HTTP 200) |
| Gateway API | http://127.0.0.1:8642 | Live |
| Container | hermes-atlas | Up |

## Quick Commands

```bash
# Start
cd ~/Code/atlas && docker compose up -d

# Stop
cd ~/Code/atlas && docker compose down

# Logs
cd ~/Code/atlas && docker compose logs -f

# Status
docker compose ps
```

## What's Installed

- **Image:** `nousresearch/hermes-agent:latest` (v2026.5.7+)
- **Model:** `claude-sonnet-4-6` via Anthropic native
- **Data:** `~/Code/atlas/hermes-data/` → container `/opt/data`
- **Dashboard:** localhost:9119 (bound to 127.0.0.1 host-side — not exposed externally)
- **Gateway:** localhost:8642 (same security boundary)

## Next Steps

### 1. Wire Telegram
1. Create a bot via Telegram @BotFather → get `TELEGRAM_BOT_TOKEN`
2. Add to `hermes-data/.env`:
   ```
   TELEGRAM_BOT_TOKEN=<your_token>
   TELEGRAM_ALLOWED_USERS=<your_telegram_user_id>
   ```
3. Restart: `docker compose restart hermes`
4. Run setup from inside the container:
   ```bash
   docker exec -it hermes-atlas hermes gateway setup
   ```

### 2. Create Skills (Scout / Quill / Buzz / Boost)
Skills go in `hermes-data/skills/`. Each is a Markdown file with YAML frontmatter.
See: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills

### 3. Verify Model
```bash
docker exec -it hermes-atlas hermes model
```
Confirm `claude-sonnet-4-6` is selected.

## Architecture Note

Hermes is **one agent**, not four. Scout/Quill/Buzz/Boost are **skills** loaded into the same agent — not separate containers. This is intentional: shared memory, shared session history, no inter-agent API overhead, no token duplication.

## Cost Discipline

- Hard cap: $5/day.
- No background polling loops.
- Every scheduled automation must have a written cost justification before activation.
- The OpenClaw incident ($28 in 4 days) does not repeat.

## Files

```
atlas/
├── docker-compose.yml     # Container config
├── CLAUDE.md              # This project's Claude Code instructions
├── README.md              # This file
├── .gitignore             # Excludes hermes-data/, .env, secrets
├── skills/                # Skill files (Scout, Quill, Buzz, Boost — TBD)
└── hermes-data/           # Persistent data volume — NOT committed to git
    ├── .env               # API keys — NOT committed to git
    ├── config.yaml        # Model config
    ├── skills/            # Hermes bundled + user skills
    ├── sessions/          # Conversation history
    └── memories/          # Agent memory store
```
