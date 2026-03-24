# Logos Module Interop — Calling Other Modules via QtRO

How to declare a dependency on another Logos module and call its methods from your plugin.

*The pattern is identical regardless of which module you're calling: kv_module, blockchain_module, delivery_module, or any future module.*

---

## 1. Declare the dependency

In `metadata.json` and `manifest.json`, list only modules that actually exist in `~/.local/share/Logos/LogosAppNix/modules/`:

```json
{
  "dependencies": ["kv_module"]
}
```

**Verify what's available before listing:**
```bash
ls ~/.local/share/Logos/LogosAppNix/modules/
```

A phantom dependency causes silent load failure — no error, module just doesn't load.

---

## 2. Get the client in initLogos()

```cpp
void YourPlugin::initLogos(LogosAPI* api) {
    logosAPI = api;  // ← REQUIRED FIRST — base class field

    // Get client for any module you depend on
    auto* kvClient = api->getClient("kv_module");
    if (kvClient) {
        m_kvClient = kvClient;
        qInfo() << "YourPlugin: connected to kv_module";
    } else {
        qWarning() << "YourPlugin: kv_module not available";
        // Decide: fail hard or degrade gracefully
    }
}
```

Store the client as a member: `LogosAPIClient* m_kvClient = nullptr;`

---

## 3. Call methods via invokeRemoteMethod

```cpp
// Syntax: invokeRemoteMethod(moduleName, methodName, args...)
// Returns: QVariant (cast to expected type)

// String return
QVariant result = m_kvClient->invokeRemoteMethod(
    "kv_module", "get", namespace, key);
QString value = result.toString();

// Bool return
QVariant ok = m_kvClient->invokeRemoteMethod(
    "kv_module", "set", namespace, key, value);

// No return (fire-and-forget)
m_kvClient->invokeRemoteMethod("kv_module", "setDataDir", dataDir);
```

**How to discover available methods:**

Run LogosApp with stderr logging and look for the method list when the module loads:
```bash
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 20 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep -A30 "Available methods in"
```

Or inspect the module's .so directly:
```bash
nm -D ~/.local/share/Logos/LogosAppNix/modules/kv_module/kv_module_plugin.so \
  | grep " T _ZN" | sed 's/.*_ZN[0-9]*//' | sed 's/E.*//' | sort -u
```

---

## 4. Guard with null check before every call

```cpp
QString YourPlugin::getData(const QString& key) {
    if (!m_kvClient) {
        qWarning() << "kv_module not available";
        return {};
    }
    return m_kvClient->invokeRemoteMethod("kv_module", "get", "your_ns", key).toString();
}
```

---

## 5. Verify interop is working

After loading, check the method invocation logs:
```bash
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 20 \
  ~/logos-workspace/result/bin/logos-app 2>&1 | grep -E "invokeRemoteMethod|ModuleProxy|your_module"
```

Look for: `ModuleProxy: Successfully called method "X" on module Y`

---

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `api->getClient("X")` returns null | X not in dependencies or not loaded | Add X to dependencies, verify it's installed |
| `invokeRemoteMethod` returns empty QVariant | Wrong method name or wrong arg count | Check method list with stderr logging |
| All ModuleProxy calls return false | `logosAPI = api` not set | Set it as the very first line of initLogos() |
| Module loads but interop silently fails | Module name mismatch | Check `strings module.so \| grep '"name"'` |
