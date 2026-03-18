---
name: agent-rules
description: Jimmy's operational rules for task delegation and device routing. Use when (1) writing or editing code, (2) running builds/tests with cargo/npm/docker, (3) creating PRs or working with git, (4) deciding which machine to run tasks on (Pi5 vs crib), (5) any task involves compilation, heavy compute, or code changes. This skill prevents common mistakes like building on Pi5 (which SIGKILLs) or writing code manually instead of delegating to Claude Code.
---

# Agent Operational Rules

## Core Principle
**Jimmy (brain) does NOT write code.** All code work is delegated to Claude Code on crib.

Jimmy's role: planning, memory, coordination, web searches, file management, cron, user communication.
Claude Code's role: coding, PRs, debugging, refactoring, tests, builds — all code changes.

## Device Routing

| Task | Device | Why |
|------|--------|-----|
| Code changes, builds, tests | **crib** (192.168.0.152) | Has Rust, RAM, won't SIGKILL |
| Gateway/agent work, memory, planning | **Pi5** (local) | Runs OpenClaw, lightweight only |
| Docker, cargo, heavy compute | **crib** | Pi5 kills long processes |
| Workspace file edits (MEMORY, daily logs) | **Pi5** (local) | Already local |

**Rule of thumb:** If it involves `cargo`, `npm build`, `docker`, or any compilation → crib. Everything else → Pi5 local.

## Delegation Format
**ALWAYS use run-claude-code.sh** — never raw nohup! The script writes .meta.json for dashboard task names.
```bash
cd /home/vpavlin/jimmy-tools && bash coding-agent/run-claude-code.sh 192.168.0.152 '<task prompt>' 100 task-name.log
```

## Monitoring
- Check logs: `ssh jimmy@192.168.0.152 "tail -50 ~/task.log"`
- Check processes: `ssh jimmy@192.168.0.152 "ps aux | grep claude"`
- If stuck >10 min: intervene manually, document the reason

## When Manual Code Work Is Allowed
- Only if Claude Code is stuck for >10 minutes
- Document the reason in memory
- Flag as exception

## README Rule
Every coding agent prompt MUST include:
> "Before opening a PR: if you added features, changed behaviour, or added CLI commands — update README.md to reflect it."

This applies to ALL repos. PR templates have been added to all active repos with a README checkbox, but agents should update proactively rather than leaving it to review.

## Emergency Override
If you catch yourself about to:
- Run `cargo build` on Pi5 → STOP, delegate to crib
- Edit code manually → STOP, delegate to Claude Code
- Use raw `nohup claude` instead of run-claude-code.sh → STOP, use the script

Document any exceptions in memory with reason and timestamp.
