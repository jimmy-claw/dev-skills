# dev-skills

Hard-won development patterns and integration skills for the Logos ecosystem.

Each skill is a self-contained directory with:
- A `README.md` explaining the pattern, when to use it, and gotchas
- Working code snippets
- Links to real PRs/repos where it was applied

## Skills

| Skill | Description |
|-------|-------------|
| [`logos-core-interop`](./logos-core-interop/) | Cross-module IPC via `logos_core_call_plugin_method_async` — the right way to call one Logos module from another |
| [`lez-program-authoring`](./lez-program-authoring/) | Writing, deploying and registering LEZ programs (SPEL framework) |
| [](./dev-process/) | Patterns & anti-patterns from running AI coding agents on real projects |
| [](./logos-module-building/) | Building Logos Core IComponent modules with Nix |

## Philosophy

These aren't tutorials — they're the things that took time to figure out and shouldn't need figuring out twice.

If something isn't in the official docs and you had to dig to find it, it belongs here.

## OpenClaw Skills

Auto-loading skills for the OpenClaw agent system. These live in `~/.openclaw/skills/` and trigger automatically based on task context.

| Skill | Description |
|-------|-------------|
| [`agent-rules`](./openclaw-skills/agent-rules/) | Jimmy's operational rules — brain vs hands, device routing, delegation format |
| [`dev-process`](./openclaw-skills/dev-process/) | Autonomous agent patterns — commit early, verify before announcing, retry rules |

To install: `cd ~/.openclaw/skills && unzip openclaw-skills/<skill-name>.skill`
