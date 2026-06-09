# Setup TODO for Sam

Items that require a human decision, a secret, or account-owner action.

- Create the GitHub remote `zokratez/atlas` and push after review.
- Confirm the Huh? channel-strategy doctrine reads correctly.
- Decide whether to install a cron job for Atlas backups. Codex should not install cron without approval.
  Suggested daily cron, only after approval:
  `17 3 * * * /Users/samoteo/Code/atlas/scripts/backup-atlas.sh >> /Users/samoteo/.atlas-backups/backup.log 2>&1`
- Telegram is connected in local Hermes runtime. Keep token/runtime config in ignored `hermes-data/`; never commit it.
- Telegram -> Atlas-vault bridge is installed locally. Source-like Telegram/dashboard turns are saved into `vault/05-intake/` before analysis through the Hermes `pre_llm_call` hook.
- Add free-tier model/API keys to the fallback chain only through local secret storage, never tracked files.
