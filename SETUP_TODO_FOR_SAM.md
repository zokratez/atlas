# Setup TODO for Sam

Items that require a human decision, a secret, or account-owner action.

- Create the GitHub remote `zokratez/atlas` and push after review.
- Confirm the Huh? channel-strategy doctrine reads correctly.
- Decide whether to install a cron job for Atlas backups. Codex should not install cron without approval.
  Suggested daily cron, only after approval:
  `17 3 * * * /Users/samoteo/Code/atlas/scripts/backup-atlas.sh >> /Users/samoteo/.atlas-backups/backup.log 2>&1`
- Connect Telegram only after creating a BotFather token and storing it outside tracked files.
- Add free-tier model/API keys to the fallback chain only through local secret storage, never tracked files.
