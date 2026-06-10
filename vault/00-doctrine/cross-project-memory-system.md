# Cross-Project Memory System

Last updated: 2026-06-09

Sam's projects should not depend on chat memory. Each durable fact belongs in the layer where it will be used.

## Source-of-truth layers

- Codex skills: reusable operating behavior. Use for "always do this" rules.
- Linear: roadmap, issues, acceptance criteria, blockers, and status.
- Atlas / Obsidian: strategy, market research, decision rationale, swipe files, experiments, and ideas.
- GitHub: shipped code, PRs, commits, migrations, and deployment proof.
- Repo docs: product memory that must travel with the code.

## Routing rule

- Behavior/rule -> Codex skill.
- Build work -> Linear issue.
- Strategy/research/why -> Atlas note.
- Shipped proof -> GitHub commit/PR.
- Product truth that should live beside code -> repo docs.

Do not duplicate everything everywhere. Cross-link where useful.

## Current projects

- PACO web/SaaS: `/Users/samoteo/Code/via`, GitHub `zokratez/via`, Codex skill `paco-peptide`.
- PACO Mobile: `/Users/samoteo/Code/paco-mobile`, GitHub `zokratez/paco-mobile`, Codex skill `paco-mobile`.
- Atlas/Hermes Growth R&D: `/Users/samoteo/Code/atlas`, Codex skill `atlas-growth-rd`.
- Huh? iOS: `/Users/samoteo/Desktop/lingua-app`, GitHub `zokratez/lingua-app`, Codex skill `huh-ios-release`.

## Tool/cost/security ledger

Every serious product should keep an operations note or repo memory with:

- tools/vendors used
- what each tool does
- where env vars/secrets live, but not secret values
- recurring or usage cost
- security/privacy risk
- billing/customer evidence needed for disputes
- rollback/panic-switch instructions

## Claude/Codex coordination

When both agents are involved, summarize:

- repo + branch + main tip
- PR/issue status
- what is shipped
- what is unverified
- what is blocked on Sam
- stale items that should not come back

