# Logos App Module — Build & Load Checklist

A skill for building and validating Logos Core IComponent modules that load correctly in LogosApp.

*Validated hands-on Mar 22–24 2026. Every item on this list caused a real loading failure when wrong.*

---

## Before Writing Any Code

Run these diagnostics on your reference implementation first:

```bash
REF=~/.local/share/Logos/LogosAppNix/modules/scala_module/scala_module_plugin.so

# 1. Confirm the correct plugin IID
strings $REF | grep "com.example"
# Expected: com.example.PluginInterface

# 2. Confirm the module name registered internally
strings $REF | grep '"name"'

# 3. Confirm dependency format
strings $REF | grep dependencies -A3

# 4. Establish baseline — what loads right now?
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 20 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep "loaded successfully"
```

Then run the same checks on your own .so after each build. Any mismatch = silent load failure.

---

## Manifest / Metadata Checklist

Both `manifest.json` and `metadata.json` must be consistent. The `.so` embeds `metadata.json` at build time — editing the installed JSON file has no effect.

```json
{
  "name": "your_module",
  "version": "0.1.0",
  "type": "core",              ← NOT "module" — causes silent load failure
  "category": "social",
  "main": {
    "linux-amd64": "your_module_plugin.so",     ← include this key
    "linux-x86_64": "your_module_plugin.so",    ← and this one
    "linux-aarch64": "your_module_plugin.so"
  },
  "dependencies": ["kv_module"],   ← ONLY list modules that actually exist in LogosAppNix/modules/
  "capabilities": [],
  "manifestVersion": "0.1.0"
}
```

**Dependency trap**: Any dependency that doesn't exist in `~/.local/share/Logos/LogosAppNix/modules/` causes `logos_core_load_plugin_with_dependencies` to silently return 0. Check what's actually installed:

```bash
ls ~/.local/share/Logos/LogosAppNix/modules/
```

---

## CMakeLists.txt Checklist

```cmake
set(CMAKE_AUTOMOC ON)   # required for Q_OBJECT
set(CMAKE_AUTORCC ON)   # required for embedded QML resources

# Plugin IID — must match PluginInterface_iid from logos-cpp-sdk
Q_PLUGIN_METADATA(IID PluginInterface_iid FILE "metadata.json")

# For headless plugin — NO Qt Quick or Qt Widgets
find_package(Qt6 REQUIRED COMPONENTS Core Qml RemoteObjects)

# For UI plugin — full Qt stack OK
find_package(Qt6 REQUIRED COMPONENTS Core Qml Quick QuickWidgets Widgets RemoteObjects)
```

**Q_PLUGIN_METADATA conflict**: If you have both headless and UI plugin targets, guard the headless one:
```cpp
#ifndef YOUR_MODULE_UI_BUILD
    Q_PLUGIN_METADATA(IID PluginInterface_iid FILE "metadata.json")
#endif
```

---

## Nix Build Checklist

```bash
export PATH=$HOME/.nix-profile/bin:$PATH

# Files not tracked by git are excluded from the nix sandbox
git add -A   # ← before every nix build, or new files won't be visible
git status   # verify everything is staged

nix build .#lgx 2>&1 | tail -20
```

**nixpkgs pin**: Must match logos-workspace's nixpkgs rev for Qt ABI compatibility. Copy the pin from `~/logos-workspace/flake.nix` or `~/scala/flake.nix`.

---

## Install Checklist

```bash
LOGOS_DIR=$HOME/.local/share/Logos/LogosAppNix
RESULT=$HOME/your-module/result/your_module

# Module (headless plugin)
chmod -R u+w $LOGOS_DIR/modules/your_module/ 2>/dev/null
mkdir -p $LOGOS_DIR/modules/your_module/
cp $RESULT/your_module_plugin.so $RESULT/metadata.json $RESULT/manifest.json \
   $LOGOS_DIR/modules/your_module/

# UI plugin
mkdir -p $LOGOS_DIR/plugins/your_module_ui/
cp $RESULT/libyour_module_ui.so $LOGOS_DIR/plugins/your_module_ui/your_module_ui.so
cp $RESULT/ui_metadata.json $LOGOS_DIR/plugins/your_module_ui/
cp -r $RESULT/qml $LOGOS_DIR/plugins/your_module_ui/
```

---

## Load Verification

**Use `QT_FORCE_STDERR_LOGGING=1` — module stats output alone is not enough.**

```bash
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 25 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep -E "your_module|loaded successfully|Failed to load"
```

✅ Success output:
```
Plugin "your_module" is now running in separate process
your_module loaded successfully.
Currently loaded plugins:
  - "your_module"
```

❌ Common failure messages and causes:
| Message | Cause |
|---|---|
| `Required dependency not loaded: X` | X not in LogosAppNix/modules/ |
| `Failed to process plugin (no metadata or invalid)` | metadata.json missing or invalid |
| Module not in loaded list, no error | Wrong `"type"` (use `"core"`) or wrong IID |
| Silent — nothing about your module | Plugin .so not being discovered at all |

---

## initLogos() — One Critical Rule

For the full pattern see [logos-app-icomponent](../logos-module-building/logos-app-icomponent.md). One thing that silently breaks everything:

```cpp
void YourPlugin::initLogos(LogosAPI* api) {
    logosAPI = api;  // ← REQUIRED: base class field. Without this, all ModuleProxy calls return false.
    // ...
}
```

---

## LGX Packaging

lgx is a **binary format**, NOT a tar.gz. Use the lgx CLI tool (`logos-workspace/scripts/lgx` or `nix-bundle-lgx`).

```bash
# Create an lgx package
lgx create
lgx add --variant linux-x86_64-dev --files ./dir --main plugin.so
```

Key rules:
- **Variant dirs use `-dev` suffix** (`linux-x86_64-dev`) — this is what lgpm uses to find files
- **Manifest main keys strip `-dev`** (`linux-x86_64`, `linux-amd64`) — the manifest embedded in the lgx root must NOT have `-dev`
- **One lgx = one type** (core OR ui). Modules with both core + UI need two separate lgx files
- Use `make install-lgx` with the Makefile pattern below

---

## metadata.json vs manifest.json (CRITICAL)

- **metadata.json**: compiled into `.so` via `Q_PLUGIN_METADATA` — controls **runtime** dependency resolution
- **manifest.json**: used by lgpm for packaging — controls what lgpm **installs**
- Editing installed `manifest.json` has **NO effect** on dependency resolution
- To change dependencies: edit `metadata.json` in the **source repo**, rebuild, reinstall
- Always verify what's baked into the binary:

```bash
strings your_plugin.so | grep dependencies -A5
```

---

## Dependency Names

Dependency name = the `"name"` field in the **dependency module's** `manifest.json` (NOT the directory name).

```bash
# Check the actual name lgpm/logos-core uses
cat ~/.local/share/Logos/LogosAppNix/modules/<dep_dir>/manifest.json | grep name
```

Wrong dep name = silent load failure or wrong module loaded.

---

## Makefile Pattern

Add to every module repo:

```makefile
LGPM ?= lgpm
LOGOS_DATA_DIR ?= $(HOME)/.local/share/Logos/LogosAppNix

.PHONY: build install-lgx

build:
	nix build .#lgx-core .#lgx-ui

install-lgx: build
	$(LGPM) install --file result-core/*.lgx --modules-dir $(LOGOS_DATA_DIR)/modules
	$(LGPM) install --file result-ui/*.lgx --ui-plugins-dir $(LOGOS_DATA_DIR)/plugins
```

Usage: `make install-lgx LGPM=../../logos-co/logos-workspace/scripts/lgpm`

---

## logos-workspace Tools

- **ws CLI**: `ws build`, `ws run`, `ws develop`, `ws test` — all support `--auto-local`
- **lgx CLI**: `logos-workspace/scripts/lgx` — create/add/verify/extract lgx packages
- **nix-bundle-lgx**: flake input for nix-native lgx bundling

---

## Quick Reference

```bash
# Is my plugin IID correct?
strings result/your_module/your_module_plugin.so | grep "com.example"

# What dependencies does my plugin declare?
strings result/your_module/your_module_plugin.so | grep dependencies -A5

# What modules are available to depend on?
ls ~/.local/share/Logos/LogosAppNix/modules/

# Full load trace
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 25 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep -v "Module stats"
```
