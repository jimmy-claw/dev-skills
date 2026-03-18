---
name: dev-process
description: Autonomous agent development patterns and anti-patterns. Use when (1) planning multi-day coding projects, (2) delegating to sub-agents or coding agents, (3) designing workflows for background tasks, (4) making decisions about commit/push timing, (5) verifying deliverables before reporting success, (6) handling build failures or retries, (7) any situation where "I might be about to make a classic agent mistake". This skill prevents costly anti-patterns like retry loops without reading errors, announcing unverified success, or losing work by not committing.
---

# Autonomous Agent Development — Patterns & Anti-Patterns

Hard-won lessons from running AI coding agents on real multi-day projects. Patterns that improved velocity, anti-patterns that burned time.

**Critical rule:** Read [references/patterns.md](references/patterns.md) for full details when any of these situations arise.

## Quick Reference — Patterns That Work

| # | Pattern | When to Apply |
|---|---------|---------------|
| 1 | Research → Design → Validate → Implement | Before starting any significant work |
| 2 | Background + Monitor + Continue | Long builds, deployments, tests |
| 3 | Incremental Commit + Push | Every working change, immediately |
| 4 | Fresh State Over Debug | Mysterious errors from stale state |
| 5 | Chain Async Steps | Build completes → tests start automatically |
| 6 | Verify Environment First | Before running tests/builds |
| 7 | Script Everything Immediately | After any multi-step operation, add to Makefile |
| 8 | Memory-Driven Continuity | Daily logs + topic files are the only persistence |

## Quick Reference — Anti-Patterns (STOP and Think)

| # | Anti-Pattern | The Rule |
|---|--------------|----------|
| 12 | Retry loops without reading errors | **2 strikes then reflect** — read the error first |
| 13 | Silent success (exit 0, no output) | Verify tests actually ran |
| 14 | Trusting "done" without verification | Check git log, build output, actual artifacts |
| 15 | Announcing unverified state | Trust but verify — if you didn't see it, don't say it |
| 16 | Fixing cascading errors first | Fix macro/root cause before downstream errors |
| 17 | Slow builds for syntax errors | Run `cargo check` before docker/cross builds |
| 18 | Wrong base branch on PRs | Check `baseRefName` before retargeting |
| 19 | Adding struct fields without checking literals | Search for `StructName {` everywhere |
| 22 | "I'll update docs later" | Docs are part of the deliverable — same PR |

## Emergency Overrides

**Before saying "done", "success", "merged", "passing":**
- Did I verify with a live check? (git log, build output, actual test run)
- If not, STOP and verify first.

**Before retrying a failed build/test for the 3rd time:**
- Did I read and understand the error message?
- If not, STOP and read it first.

**Before starting a long-running task:**
- Is it in background with monitoring?
- If not, STOP and set that up first.

## Full Details

See [references/patterns.md](references/patterns.md) for:
- Complete workflow model with human/agent interaction
- Case studies and implementation details
- Security pattern: deterministic author classification
- Metrics for autonomous development sessions
- Platform recommendations
