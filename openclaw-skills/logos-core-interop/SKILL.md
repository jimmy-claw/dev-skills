---
name: logos-core-interop
description: Cross-module IPC for Logos Core via logos_core_call_plugin_method_async and Rust FFI bridge. Use when (1) calling one Logos module from another, (2) integrating Rust code with Logos Core C API, (3) handling async callbacks from Logos plugins, (4) converting between Rust async and C callbacks, (5) any task involving Qt Remote Objects, invokeRemoteMethod, or module-to-module communication in Logos ecosystem.
---

# Logos Core Inter-Module IPC

The right way to call one Logos module from another — via C API and Rust FFI bridge.

## Quick Reference

### C API (from logos-cpp-sdk)

```c
// Call any method on any loaded plugin
void logos_core_call_plugin_method_async(
    const char* plugin_name,   // e.g. "storage_module", "delivery_module"
    const char* method_name,   // e.g. "uploadInit", "sendMessage"
    const char* params_json,   // [{"name":"x","value":"y","type":"string"}, ...]
    AsyncCallback callback,
    void* user_data
);

// Subscribe to events
void logos_core_register_event_listener(
    const char* plugin_name,
    const char* event_name,
    AsyncCallback callback,
    void* user_data
);
```

### params_json Format

```json
[
  {"name": "filename", "value": "agent-card.json", "type": "string"},
  {"name": "chunkSize", "value": "65536", "type": "int"},
  {"name": "enabled", "value": "true", "type": "bool"}
]
```

### Rust FFI Bridge Pattern

```rust
// 1. Declare FFI
extern "C" {
    pub fn logos_core_call_plugin_method_async(
        plugin_name: *const c_char,
        method_name: *const c_char,
        params_json: *const c_char,
        callback: extern "C" fn(c_int, *const c_char, *mut c_void),
        user_data: *mut c_void,
    );
}

// 2. Bridge callback to async Rust via oneshot channel
pub async fn call_plugin_method(
    plugin: &str,
    method: &str,
    params: &str,
) -> Result<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx_ptr = Box::into_raw(Box::new(tx));
    unsafe {
        logos_core_call_plugin_method_async(
            CString::new(plugin)?.as_ptr(),
            CString::new(method)?.as_ptr(),
            CString::new(params)?.as_ptr(),
            on_callback,
            tx_ptr as *mut c_void,
        );
    }
    rx.await.map_err(|_| anyhow!("callback never fired"))
}

extern "C" fn on_callback(
    result: c_int,
    message: *const c_char,
    user_data: *mut c_void,
) {
    let tx = unsafe {
        Box::from_raw(user_data as *mut oneshot::Sender<Result<String>>)
    };
    let msg = unsafe { CStr::from_ptr(message) }
        .to_string_lossy()
        .into_owned();
    let _ = tx.send(if result == 1 { Ok(msg) } else { Err(anyhow!(msg)) });
}
```

## Common Patterns

### From C++ (inside Logos module)

```cpp
auto* client = m_logosAPI->getClient("waku_module");
QVariant result = client->invokeRemoteMethod("waku_module", "method", arg1);
```

### Emitting Events (C++)

```cpp
emit eventResponse("event_name", QVariantList() << "arg1" << "arg2");
```

## Key Gotchas

| Issue | Fix |
|-------|-----|
| Callback never fires | Ensure `user_data` outlives the async call |
| Memory leak | Use `Box::into_raw` / `Box::from_raw` pattern |
| String lifetime | Copy `CStr` immediately in callback |
| Thread safety | Logos callbacks may come from any thread — use channels |

## Full Reference

See [references/logos-core-interop.md](references/logos-core-interop.md) for complete implementation details, LMAO integration example, and Qt Remote Objects patterns.
