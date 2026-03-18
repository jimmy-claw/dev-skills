---
name: logos-module-builder
description: Build Logos Core IComponent modules using the official logos-module-builder. Use when (1) creating a new Logos Core module, (2) migrating from legacy nix/ directory style, (3) building a module with nix, (4) configuring module.yaml or flake.nix for Logos modules, (5) adding external libraries to a Logos module, (6) any task involving logos_module() CMake macro or mkLogosModule. This skill provides templates and migration steps for the modern module builder approach.
---

# Logos Module Builder

Official way to create/update Logos Core modules. Replaces manual flake.nix + nix/ directory approach.

## Quick Start — New Module

1. Copy templates from assets:
   - `assets/flake.nix` → `flake.nix`
   - `assets/module.yaml` → `module.yaml`

2. Edit `module.yaml` with your module config

3. Create `CMakeLists.txt`:
   ```cmake
   logos_module()
   ```

4. Build:
   ```bash
   nix build
   ```

## Migration from Legacy (nix/ directory)

1. Create `module.yaml` from existing nix files
2. Simplify `flake.nix` to use `mkLogosModule` (see assets/flake.nix)
3. Replace `CMakeLists.txt` with `logos_module()` macro
4. Delete `nix/` directory
5. Move source files to `src/` if needed
6. **CRITICAL:** `git add` everything before `nix build` (Nix only sees tracked files!)

## Key Concepts

- `mkLogosModule` in flake.nix — handles all the nix boilerplate
- `module.yaml` — all config in one place (replaces scattered nix/ files)
- `logos_module()` CMake macro — replaces custom CMakeLists
- Auto-generates `include` field in metadata.json from module.yaml

## External Libraries

| Approach | When | module.yaml | flake.nix |
|----------|------|-------------|-----------|
| `vendor_path: "lib"` | Pre-built .so in repo | simple | simple |
| `flake_input: "name"` | Build from source | + flake_input key | + externalLibInputs |

## Module Structure

```
logos-{name}-module/
├── flake.nix       # mkLogosModule + inputs
├── module.yaml     # All config here
├── metadata.json   # Runtime metadata
├── CMakeLists.txt  # logos_module() macro
└── src/
    ├── {name}_interface.h   # Q_INVOKABLE virtual methods
    ├── {name}_plugin.h
    └── {name}_plugin.cpp
```

## Calling Other Modules

```cpp
auto* client = m_logosAPI->getClient("waku_module");
QVariant result = client->invokeRemoteMethod("waku_module", "method", arg1);
```

## Emitting Events

```cpp
emit eventResponse("event_name", QVariantList() << "arg1" << "arg2");
```

## Full Reference

See [references/logos-module-builder.md](references/logos-module-builder.md) for complete details, examples, and troubleshooting.

## Common Mistakes

- **Nix only sees tracked files** — `git add` before building
- **Wrong CMake** — use `logos_module()`, not custom CMakeLists
- **Missing module.yaml** — this is required, not optional
- **Legacy nix/ still exists** — delete it after migration
