# Task Definition Template

A skill for defining tasks that produce reliable, predictable results from AI coding agents.

*Derived from hands-on experience — when this isn't followed, agents use wrong references, make unspoken assumptions, and iterate in the wrong direction for hours.*

---

## The 5-Part Task Brief

Every non-trivial coding task needs these 5 parts. If any are missing, the agent will fill the gap with assumptions — and those assumptions will be wrong.

### 1. Goal (one sentence)
What does success look like from the user's perspective?

> ✅ *"Build yolo-ng as a Logos App IComponent module that loads in LogosApp"*  
> ❌ *"Fix YOLO"*

### 2. References (explicit list, nothing else)
Which repos/files should the agent look at? Name them explicitly.

> ✅ *"Use ONLY: ~/scala (IComponent reference), ~/logos-workspace/repos/logos-template-module (scaffold)"*  
> ❌ *"Look at similar modules"*

If a reference might be broken or patched, **explicitly exclude it**.

### 3. Acceptance criteria (binary, testable)
A list of checks with exact commands. Each one is pass/fail. No ambiguity.

> ✅
> ```
> 1. nix build .#lgx succeeds
> 2. QT_FORCE_STDERR_LOGGING=1 timeout 25 ~/logos-workspace/result/bin/logos-app 2>&1 | grep "yolo_ng loaded successfully"
> 3. strings result/yolo_ng/yolo_ng_plugin.so | grep "com.example.PluginInterface"
> ```
> ❌ *"Make sure it works"*

### 4. Constraints (what NOT to do)
Explicitly list things the agent should not do, even if they seem like shortcuts.

> ✅ *"Do NOT modify logos-app source or binary."*

### 5. Verification baseline
Run these BEFORE making changes to establish current state:
```bash
# example
strings existing_plugin.so | grep iid
QT_QPA_PLATFORM=offscreen timeout 12 ~/logos-workspace/result/bin/logos-app 2>&1 | grep "Module stats"
```

---

## Template (copy-paste this)

```markdown
## Task: [one-line goal]

## References (use ONLY these)
- [path/repo]: [what it demonstrates]
- [path/repo]: [what it demonstrates]

## Do NOT use
- [path/repo]: [reason — e.g. broken, patched, incompatible]

## Constraints
- [explicit restriction]
- [explicit restriction]

## Acceptance Criteria
1. [exact command] → [expected output]
2. [exact command] → [expected output]
3. [exact command] → [expected output]

## Verification baseline (run before changing anything)
- [command to establish current state]
```

---

## Signs a task brief is incomplete

- Agent starts immediately with no clarifying questions → assumptions were made
- Agent uses a reference not in the list → gaps were filled silently
- "Done" is announced before running the acceptance criteria commands
- The brief can be understood in more than one way

**The no-questions rule**: If the agent asks zero questions before starting, something is wrong. Curiosity before execution is a signal of understanding, not weakness. If *you* also had no questions when writing the brief, it probably isn't specific enough yet.

---

## Diagnostic-first principle

Before writing any code, verify that your reference and your target agree on the fundamental interface. For Logos modules:

```bash
# Check plugin IID
strings reference_plugin.so | grep "com.example"
strings your_plugin.so | grep "com.example"

# Check embedded dependencies
strings your_plugin.so | grep dependencies

# Check module name
strings your_plugin.so | grep '"name"'
```

Two seconds of diagnostics beats hours of iteration in the wrong direction.
