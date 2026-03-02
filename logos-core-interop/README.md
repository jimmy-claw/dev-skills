# Logos Core Inter-Module IPC

**The right way to call one Logos module from another.**

Instead of embedding Nim/C FFI directly in your module, use Logos Core's built-in
inter-module IPC via Qt Remote Objects. This keeps your module decoupled and lets
Logos Core manage dependencies, lifecycle, and transport.

## When to use this

You're building a Logos module (e.g. LMAO) that needs functionality from another
module (e.g. storage, delivery, waku). Don't link against their Nim libs directly —
call them through Logos Core.

## The C API

From `logos_core.h` (in `logos-cpp-sdk`):

```c
typedef void (*AsyncCallback)(int result, const char* message, void* user_data);

// Call any Q_INVOKABLE method on any loaded plugin
void logos_core_call_plugin_method_async(
    const char* plugin_name,   // e.g. "storage_module"
    const char* method_name,   // e.g. "uploadInit"
    const char* params_json,   // JSON: [{"name":"x","value":"y","type":"string"}, ...]
    AsyncCallback callback,
    void* user_data
);

// Subscribe to events emitted by any loaded plugin
void logos_core_register_event_listener(
    const char* plugin_name,   // e.g. "storage_module"
    const char* event_name,    // e.g. "storageUploadDone"
    AsyncCallback callback,
    void* user_data
);
```

Implemented in `logos-co/logos-liblogos` → `src/logos_core/proxy_api.cpp`.

## params_json format

```json
[
  {"name": "filename",  "value": "agent-card.json", "type": "string"},
  {"name": "chunkSize", "value": "65536",            "type": "int"},
  {"name": "enabled",   "value": "true",             "type": "bool"}
]
```

## Rust FFI bridge

The key challenge: bridging a C callback to Rust async. Use `tokio::sync::oneshot`
and `Box::into_raw` to pass the sender as `user_data`:

```rust
use std::ffi::{CString, CStr, c_char, c_int, c_void};
use tokio::sync::oneshot;
use anyhow::{anyhow, Result};

extern "C" {
    fn logos_core_call_plugin_method_async(
        plugin_name: *const c_char,
        method_name: *const c_char,
        params_json: *const c_char,
        callback: extern "C" fn(c_int, *const c_char, *mut c_void),
        user_data: *mut c_void,
    );
}

extern "C" fn on_result(result: c_int, message: *const c_char, user_data: *mut c_void) {
    // SAFETY: user_data is always a Box<oneshot::Sender<Result<String>>> from below
    let tx = unsafe { Box::from_raw(user_data as *mut oneshot::Sender<Result<String>>) };
    let msg = unsafe { CStr::from_ptr(message) }.to_string_lossy().into_owned();
    let _ = tx.send(if result == 1 { Ok(msg) } else { Err(anyhow!(msg)) });
}

pub async fn call_plugin(plugin: &str, method: &str, params_json: &str) -> Result<String> {
    let (tx, rx) = oneshot::channel::<Result<String>>();
    let user_data = Box::into_raw(Box::new(tx)) as *mut c_void;

    unsafe {
        logos_core_call_plugin_method_async(
            CString::new(plugin)?.as_ptr(),
            CString::new(method)?.as_ptr(),
            CString::new(params_json)?.as_ptr(),
            on_result,
            user_data,
        );
    }

    rx.await.map_err(|_| anyhow!("callback never fired"))?
}
```

## Event listener bridge

For events (async notifications), use a channel that can receive multiple messages:

```rust
extern "C" {
    fn logos_core_register_event_listener(
        plugin_name: *const c_char,
        event_name: *const c_char,
        callback: extern "C" fn(c_int, *const c_char, *mut c_void),
        user_data: *mut c_void,
    );
}

extern "C" fn on_event(result: c_int, message: *const c_char, user_data: *mut c_void) {
    let tx = user_data as *mut std::sync::mpsc::Sender<String>;
    if let Some(tx) = unsafe { tx.as_ref() } {
        let msg = unsafe { CStr::from_ptr(message) }.to_string_lossy().into_owned();
        let _ = tx.send(msg);
    }
}

pub fn listen_for_event(plugin: &str, event: &str) -> std::sync::mpsc::Receiver<String> {
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    // Keep tx alive for the lifetime of the listener
    let tx_ptr = Box::into_raw(Box::new(tx));
    unsafe {
        logos_core_register_event_listener(
            CString::new(plugin).unwrap().as_ptr(),
            CString::new(event).unwrap().as_ptr(),
            on_event,
            tx_ptr as *mut c_void,
        );
    }
    rx
}
```

## build.rs

```rust
fn main() {
    println!("cargo:rustc-link-lib=logos_core");
    if let Ok(dir) = std::env::var("LOGOS_CORE_LIB_DIR") {
        println!("cargo:rustc-link-search={}", dir);
    }
}
```

Use a feature flag so it's opt-in:
```toml
[features]
default = ["rest"]
rest = []
logos-core = []
```

## Storage module example

Upload a file via `storage_module`:

```rust
// Step 1: init upload session
let session_id = call_plugin("storage_module", "uploadInit",
    r#"[{"name":"filename","value":"data.bin","type":"string"},
        {"name":"chunkSize","value":"65536","type":"int"}]"#
).await?;

// Step 2: send chunks
let chunk_b64 = base64::encode(&data);
call_plugin("storage_module", "uploadChunk",
    &format!(r#"[{{"name":"sessionId","value":"{}","type":"string"}},
                  {{"name":"chunk","value":"{}","type":"string"}}]"#,
        session_id, chunk_b64)
).await?;

// Step 3: finalize — CID comes back via "storageUploadDone" event
let rx = listen_for_event("storage_module", "storageUploadDone");
call_plugin("storage_module", "uploadFinalize",
    &format!(r#"[{{"name":"sessionId","value":"{}","type":"string"}}]"#, session_id)
).await?;
let event_json = rx.recv()?;
// parse CID from event_json
```

## Applied in

- `jimmy-claw/lmao` — `crates/logos-messaging-a2a-storage`, `LogosCoreStorageBackend`
  - PR: https://github.com/jimmy-claw/lmao/pull/22
  - Branch: `jimmy/logos-storage-backend`

## TODO: Apply to transport

Same pattern for replacing `NwakuRestTransport` with `LogosCoreDeliveryTransport`:
- Plugin: `delivery_module`
- Interface: `logos-co/logos-delivery-module/delivery_module_interface.h`
- Key methods: `init`, `start`, `sendMessage`
- Key events: `messageSent`, `messageReceived`

## Key repos

| Repo | Relevance |
|------|-----------|
| `logos-co/logos-liblogos` | C API (`logos_core.h`), impl (`proxy_api.cpp`) |
| `logos-co/logos-cpp-sdk` | Headers for module authors |
| `logos-co/logos-storage-module` | `storage_module_interface.h` — all methods + events |
| `logos-co/logos-delivery-module` | `delivery_module_interface.h` |
| `logos-co/logos-waku-module` | `waku_module_interface.h` |

## Gotchas

- `Box::into_raw` for oneshot sender — don't drop it before callback fires
- Event listeners: the sender must stay alive (leaked intentionally or stored somewhere)
- `params_json` types: `"string"`, `"int"`, `"bool"`, `"double"` — check `proxy_api.cpp`
- Plugin must be loaded before calling — `logos_core_load_plugin("storage_module")` first
- Confirmed with Logos Core dev at Logos Lisbon meetup (Mar 2026) as the intended pattern
