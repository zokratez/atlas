# Architecture

Atlas has three planes: knowledge, execution, and memory.

## Knowledge Plane

The knowledge plane lives in `vault/`. It is an Obsidian-friendly Markdown vault that can be reviewed by a human, versioned in git, and reused across products.

```text
vault/
|-- 00-doctrine/       # operator rules, communication, cost governance
|-- 01-brands/         # brand-specific voice, channels, cadence, constraints
|-- 02-playbooks/      # repeatable channel workflows
|-- 03-skills-source/  # source markdown that compiles into Hermes skills
|-- 04-memory/         # human-readable learning log
|-- 05-intake/         # raw marketing sources Sam dumps
|-- 06-opportunities/  # proof-checked ideas worth considering
|-- 07-validated/      # patterns with direct or strong external proof
|-- 08-experiments/    # tests ready to run or already running
`-- 09-swipe-file/     # creative examples and patterns
```

The vault is the source of truth. If a channel rule changes, it should change here first.

## Execution Plane

The execution plane is Hermes Agent. Atlas stores compiled skills in `skills/`, then syncs them into the running Hermes container at `/opt/data/skills/`.

```text
vault/03-skills-source/huh-channel-strategy/SKILL.md
        |
        v
skills/huh-channel-strategy/SKILL.md
        |
        v
hermes-atlas:/opt/data/skills/huh-channel-strategy/SKILL.md
```

`packages` or framework code are not required for the current layer. The runtime is Docker plus Hermes.

The cross-product R&D execution skill is:

```text
skills/atlas-growth-rd/SKILL.md
```

It proof-checks dumped sources, assigns evidence grades, maps ideas to products, and turns plausible patterns into experiments.

## Memory Plane

Atlas uses two memory layers:

- Hermes runtime memory: sessions, state database files, and built-in memories under `/opt/data`.
- Atlas public memory: `vault/04-memory/learning-log.md` for durable, reviewable lessons.

Future external memory systems such as Honcho or Zep can be added later, but the first version is intentionally simple and inspectable.

## Safety Boundary

Tracked:

- Vault doctrine.
- Compiled skills.
- Scripts.
- Public docs.

Not tracked:

- `.env` files.
- `hermes-data/`.
- auth profiles.
- private keys.
- secret-bearing runtime state.

## Operational Flow

1. Update the vault.
2. Compile or mirror selected skill source into `skills/`.
3. Run `scripts/verify-no-secrets.sh`.
4. Run `scripts/sync-skills.sh`.
5. Test the agent behavior.
6. Record lessons in the learning log.
7. Commit one coherent change.
