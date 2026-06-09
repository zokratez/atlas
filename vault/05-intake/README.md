# Intake

Drop raw marketing sources here before Atlas analyzes them.

Examples:

- articles
- tweets/X threads
- YouTube/TikTok/Reels transcripts
- screenshots
- competitor pages
- App Store listings
- Reddit threads
- customer quotes
- ad examples
- pricing pages
- funnel teardown notes

Markdown files here use:

```text
YYYY-MM-DD-short-source-title.md
```

If you are dropping a PDF, screenshot, image, or raw downloaded file, normalize it first:

```bash
cd ~/Code/atlas
scripts/process-intake-drop.sh /path/to/file "Source title" "https://source-url-if-any"
```

Then ask Hermes/Atlas, or paste a source-like message into Telegram/dashboard with `Atlas intake`:

```text
Use atlas-growth-rd to analyze vault/05-intake/<file>. Turn it into a proof-checked opportunity or reject it.
```

Dashboard/Telegram source-like turns are saved here automatically by the Atlas intake bridge before analysis.
