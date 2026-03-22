# Logos Miniapp Workflow

How to build a Logos App miniapp end-to-end. Each step has a gate — do not proceed until the gate passes.

*The key insight: doing steps out of order means errors in step 2 poison step 5. Each gate is a 30-second check that prevents hours of debugging.*

---

## Before You Start — Questions to Answer

Before writing a single line of code, answer these (no assumptions):

1. What is the module name? (affects manifest, install path, dependency declarations)
2. Which modules does it depend on? (verify they exist: `ls ~/.local/share/Logos/LogosAppNix/modules/`)
3. Does it need a UI plugin, or headless only?
4. What reference implementation will you use? (must be explicitly named)
5. What are the acceptance criteria? (write them down before starting)

If you can't answer all 5 — ask before starting.

---

## Step 1: Scaffold

**Skill**: logos-module-scaffold *(TODO)*  
**What**: Create project structure from template (CMakeLists, flake.nix, src/, qml/, metadata.json, manifest.json)  
**Reference**: `~/logos-workspace/repos/logos-template-module` or `~/scala`

**Gate ✓**: `ls your-module/` shows: CMakeLists.txt, flake.nix, src/, metadata.json, manifest.json

---

## Step 2: Build

**Skill**: logos-module-build  
**What**: nix build produces .lgx with correct plugin IID and manifest

```bash
git add -A  # all files must be git-tracked for nix sandbox
nix build .#lgx
strings result/your_module/your_module_plugin.so | grep "com.example.PluginInterface"
```

**Gate ✓**: `nix build .#lgx` exits 0 AND `strings` shows `com.example.PluginInterface`

Do not proceed if the IID is wrong — the module will never load regardless of anything else.

---

## Step 3: Install and Load

**Skill**: logos-module-build (load section)  
**What**: Install files to LogosAppNix, verify module appears in loaded plugins

```bash
# Install
LOGOS_DIR=$HOME/.local/share/Logos/LogosAppNix
cp result/your_module/your_module_plugin.so $LOGOS_DIR/modules/your_module/
cp result/your_module/metadata.json result/your_module/manifest.json $LOGOS_DIR/modules/your_module/

# Verify
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 25 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep "your_module loaded successfully"
```

**Gate ✓**: `your_module loaded successfully.` appears in output

Do not proceed to UI or interop until this passes. Debugging loading failures is much easier without UI complexity.

---

## Step 4: Module Interop (if needed)

**Skill**: logos-module-interop  
**What**: Wire up dependencies (kv_module, etc.) in initLogos(), verify method calls work

```bash
# Confirm methods are being called
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 25 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep "Successfully called method"
```

**Gate ✓**: `ModuleProxy: Successfully called method "X"` appears for each module you call

---

## Step 5: UI Plugin (if needed)

**Skill**: logos-icomponent  
**What**: Build IComponent UI plugin, wire QML to backend via context property

**Gate ✓**: UI plugin loads without errors, QML renders (test with a visible element first)

---

## Step 6: Feature Implementation

Only start feature code after steps 1-5 gate. At this point you know:
- The module loads ✓
- Dependencies connect ✓  
- UI renders ✓

Now implement the actual feature logic.

**Gate ✓**: Acceptance criteria from Step 0 all pass

---

## Step 7: Commit and Push

```bash
git add -A
git commit -m "feat: your-module initial implementation"
git push origin your-branch
```

**Gate ✓**: CI passes (or at minimum: `nix build .#lgx` passes on a clean checkout)

---

## Steps Blocked on Upstream (as of Mar 2026)

- **Blockchain inscription** (zone-sdk C bindings not yet in blockchain-module) → use CLI workaround or wait
- **Codex storage upload** (storage_module not yet in LogosAppNix) → wait for upstream

---

## The Meta-Rule

**If a gate fails, fix it before moving on.** Resist the urge to "try the next step anyway" — you will always regret it.

If a gate has been failing for >15 minutes: stop, describe the exact error, ask for help. Don't iterate blindly.
