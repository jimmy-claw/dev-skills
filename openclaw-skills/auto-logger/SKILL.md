---
name: auto-logger
description: Automatically maintain daily logs by recording state-changing operations. Use when (1) performing any write, edit, or exec operation that changes state, (2) completing significant work chunks that should be recorded, (3) user asks about daily log status or complains about missing logs. This skill ensures the daily cron summary has accurate data by logging operations incrementally rather than batching at session end.
---

# Auto-Logger — Mechanical Daily Log Maintenance

**Problem:** Daily logs are forgotten until session end, resulting in garbage cron summaries.
**Solution:** Log state changes mechanically, immediately, with minimal overhead.

## When to Log

| Operation | Log? | Example Entry |
|-----------|------|---------------|
| `write` | ✅ Yes | `2026-03-18 16:55: write → memory/daily/2026-03-18.md (1826 chars)` |
| `edit` | ✅ Yes | `2026-03-18 16:56: edit → README.md (2 lines changed)` |
| `exec` (success) | ✅ Yes | `2026-03-18 16:57: exec → git commit in dev-skills (3 files)` |
| `read` | ❌ No | Read-only, no state change |
| `memory_search` | ❌ No | Read-only lookup |
| `web_search` | ❌ No | Read-only research |
| `exec` (failed) | ❌ No | Only log successes |
| `image` | ❌ No | Analysis, not state change |

## Log Format

```
YYYY-MM-DD HH:MM: <operation> → <file/path> (<context>)
```

**Context examples:**
- File writes: `(1826 chars)` or `(3 lines added)`
- Git operations: `(3 files)` or `(commit 2989713)`
- Builds: `(nix build success)`
- SSH: `(crib: cargo build)`

## Implementation

**After every state-changing tool call:**

1. Check if operation should be logged (see table above)
2. If yes, append one line to `memory/daily/YYYY-MM-DD.md`
3. Do NOT narrate to user (silent operation)
4. Do NOT wait for user confirmation

## Daily Log Structure

```
2026-03-18 15:12: Session start. Read SOUL.md, USER.md, MEMORY.md.
2026-03-18 15:27: write → skills/agent-rules/SKILL.md (2598 chars)
2026-03-18 15:28: exec → package_skill.py agent-rules (success)
2026-03-18 15:29: exec → git commit/push in dev-skills (commit 31178a9)
...
2026-03-18 16:50: Session summary: 5 skills created, 1 PR merged.
```

## Emergency Override

If user says "don't log this" or "skip logging" → respect immediately, do not append.

## Verification

**Check log health:**
```bash
tail -20 memory/daily/$(date +%Y-%m-%d).md
wc -l memory/daily/$(date +%Y-%m-%d).md
```

**Healthy log:** >10 entries for active session, last entry <30 min old.
**Unhealthy log:** <5 entries, last entry >2h old, or empty.

## Full Reference

See [references/auto-logger.md](references/auto-logger.md) for examples, edge cases, and troubleshooting.
