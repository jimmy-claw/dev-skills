---
name: session-wrap-up
description: Review coding sessions for skill gaps and improvement opportunities. Use when (1) user says "done", "wrapping up", "session end", "finished for today", (2) ending any significant coding or development work, (3) after completing multi-step tasks that involved skills. This skill reviews the session, identifies patterns that should be captured in skills, and proposes updates to dev-skills repo.
---

# Session Wrap-Up — Skill Maintenance

Review completed work for patterns that should be added to or updated in skills.

## When to Run

- User says: "done", "wrapping up", "finished", "session end", "calling it a day"
- After any significant coding session (>30 min, >10 tool calls)
- Before: "commit and push", "end of day summary"

## Review Process

### 1. Read Today's Daily Log

```bash
tail -100 memory/daily/$(date +%Y-%m-%d).md
```

### 2. Look for Skill Gaps

| Pattern in Log | What It Means | Action |
|----------------|---------------|--------|
| "had to manually..." | Skill should have automated this | Propose skill update |
| "skill didn't..." / "forgot to..." | Existing skill incomplete | Propose skill fix |
| "learned that..." / "discovered..." | New pattern not in skills | Propose new skill or add to existing |
| "retried 3 times..." | Anti-pattern not caught | Add to dev-process skill |
| "workaround for..." | Hack that should be documented | Add to relevant skill |
| Same error twice in one session | Skill not auto-loading | Check skill triggers |

### 3. Check Against Existing Skills

Review `~/.openclaw/skills/` and `~/dev-skills/openclaw-skills/`:
- Was a relevant skill loaded during this session?
- If yes: did it help? what was missing?
- If no: should one have triggered?

### 4. Decision Tree

```
Significant gap found?
├── Yes → Generate PR to dev-skills
│         └── Create branch: skill-update/YYYY-MM-DD-brief-desc
│         └── Edit relevant skill in openclaw-skills/
│         └── Update README.md if needed
│         └── Commit and push
│         └── Open PR with summary
│
└── No  → Log to memory/topics/skill-backlog.md
          └── Batch for later review
```

## PR Generation (if significant)

**Significant = any of:**
- New anti-pattern discovered
- Missing step in existing workflow
- New tool/integration pattern
- Same mistake could cost >30 min next time

**PR format:**
```
title: skill: <skill-name> — <brief description>

What was missing:
- <specific gap identified>

What was learned:
- <new pattern or fix>

Changes:
- <list of files modified>
```

## Minor Patterns (batch for later)

If not significant enough for immediate PR:

```markdown
## YYYY-MM-DD

- **Skill:** <name>
- **Gap:** <what was missing>
- **Fix:** <what should be added>
- **Priority:** low|medium|high
```

## Emergency Override

If user says "don't review" or "skip wrap-up" → respect immediately, log that wrap-up was skipped.

## Full Reference

See [references/session-wrap-up.md](references/session-wrap-up.md) for detailed examples and templates.
