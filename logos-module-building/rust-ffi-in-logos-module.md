# Rust FFI in a Logos Core Module

Full pattern for wrapping a Rust `cdylib` behind C FFI and calling it from a Qt Logos Core module.

**Reference implementation:** [jimmy-claw/zone-sequencer-rs](https://github.com/jimmy-claw/zone-sequencer-rs) (Rust cdylib) + [jimmy-claw/logos-zone-sequencer-module](https://github.com/jimmy-claw/logos-zone-sequencer-module) (Qt wrapper)

---

## Architecture

```
Qt module (C++ headless plugin, runs in logos_host)
    ↓ dlopen/dlsym or direct link
Rust cdylib (libfoo_rs.so)
    ↓ async (tokio)
External service / SDK (e.g. zone-sdk → Logos blockchain devnet)
```

---

## Step 1: Rust cdylib

### Cargo.toml

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
tokio = { version = "1", features = ["full"] }
# your SDK deps here
```

### Export C functions

Every FFI function must be `#[no_mangle]` + `extern "C"` + wrapped in `panic::catch_unwind`:

```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic;
use std::sync::OnceLock;
use tokio::runtime::Runtime;

// Global tokio runtime — created once, reused across all FFI calls
static RUNTIME: OnceLock<Runtime> = OnceLock::new();

fn get_runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| Runtime::new().unwrap())
}

/// Publish data to a zone channel.
/// Returns 0 on success, negative on error.
#[no_mangle]
pub extern "C" fn zone_publish(
    channel_name: *const c_char,
    channel_secret: *const c_char,
    data: *const c_char,
    endpoint: *const c_char,
) -> i32 {
    panic::catch_unwind(|| {
        let name = unsafe { CStr::from_ptr(channel_name) }.to_str().unwrap_or("");
        let secret = unsafe { CStr::from_ptr(channel_secret) }.to_str().unwrap_or("");
        let data = unsafe { CStr::from_ptr(data) }.to_str().unwrap_or("");
        let endpoint = unsafe { CStr::from_ptr(endpoint) }.to_str().unwrap_or("");

        let rt = get_runtime();
        rt.block_on(async {
            // All async SDK calls go here
            // ZoneSequencer::init() must be inside block_on because it calls tokio::spawn()
            match do_publish(name, secret, data, endpoint).await {
                Ok(_) => 0,
                Err(e) => {
                    eprintln!("zone_publish error: {e}");
                    -2
                }
            }
        })
    })
    .unwrap_or(-1) // -1 = panic caught
}

/// Query messages from a zone channel.
/// Returns a JSON string (caller must free with zone_free_string).
#[no_mangle]
pub extern "C" fn zone_query_channel(
    channel_id_hex: *const c_char,
    endpoint: *const c_char,
    limit: u32,
) -> *mut c_char {
    panic::catch_unwind(|| {
        let channel_id = unsafe { CStr::from_ptr(channel_id_hex) }.to_str().unwrap_or("");
        let endpoint = unsafe { CStr::from_ptr(endpoint) }.to_str().unwrap_or("");

        let rt = get_runtime();
        let result = rt.block_on(async {
            do_query(channel_id, endpoint, limit).await
        });

        match result {
            Ok(json) => CString::new(json).unwrap_or_default().into_raw(),
            Err(e) => CString::new(format!(r#"{{"error":"{}"}}"#, e)).unwrap_or_default().into_raw(),
        }
    })
    .unwrap_or(std::ptr::null_mut())
}

/// Free a string returned by zone_query_channel.
#[no_mangle]
pub extern "C" fn zone_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)); }
    }
}
```

### Key rules

1. **`panic::catch_unwind`** on every FFI function — unwinding across FFI boundary is UB
2. **Global static `OnceLock<Runtime>`** — creating a runtime per call is expensive and can deadlock
3. **`ZoneSequencer::init()` must be inside `block_on()`** — it calls `tokio::spawn()` which requires a runtime context
4. **Always provide a `_free` function** for any allocated strings/buffers returned to C

---

## Step 2: C Header

Create a header for the Qt side to use:

```c
// zone_sequencer_rs.h
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

int zone_publish(
    const char* channel_name,
    const char* channel_secret,
    const char* data,
    const char* endpoint
);

char* zone_query_channel(
    const char* channel_id_hex,
    const char* endpoint,
    unsigned int limit
);

void zone_free_string(char* s);

#ifdef __cplusplus
}
#endif
```

---

## Step 3: Qt Module — CMake Integration

### Option A: Direct link (headless module)

```cmake
# Find the Rust .so
find_library(ZONE_SEQ_RS zone_sequencer_rs
    PATHS "${CMAKE_CURRENT_SOURCE_DIR}/../zone-sequencer-rs/target/release"
)

target_link_libraries(your_module PRIVATE ${ZONE_SEQ_RS})

# RPATH so the .so is found at runtime
set_target_properties(your_module PROPERTIES
    INSTALL_RPATH "$ORIGIN"
    BUILD_WITH_INSTALL_RPATH TRUE
)
```

### Option B: dlopen/dlsym (UI plugin)

For UI plugins, direct linking may cause "undefined symbol" errors because logos_core symbols aren't available at load time. Use `dlsym` instead:

```cpp
#include <dlfcn.h>

class RustBridge {
    void* m_lib = nullptr;
    using PublishFn = int(*)(const char*, const char*, const char*, const char*);
    using QueryFn = char*(*)(const char*, const char*, unsigned int);
    using FreeFn = void(*)(char*);

    PublishFn m_publish = nullptr;
    QueryFn m_query = nullptr;
    FreeFn m_free = nullptr;

public:
    bool load(const QString& soPath) {
        m_lib = dlopen(soPath.toUtf8().constData(), RTLD_NOW);
        if (!m_lib) return false;
        m_publish = (PublishFn)dlsym(m_lib, "zone_publish");
        m_query = (QueryFn)dlsym(m_lib, "zone_query_channel");
        m_free = (FreeFn)dlsym(m_lib, "zone_free_string");
        return m_publish && m_query && m_free;
    }

    ~RustBridge() { if (m_lib) dlclose(m_lib); }
};
```

---

## Step 4: RPATH Configuration

The Qt plugin needs RPATH entries for both Nix Qt libraries AND the Rust `.so`:

```cmake
set_target_properties(your_plugin PROPERTIES
    INSTALL_RPATH "$ORIGIN"           # finds Rust .so next to plugin
    BUILD_WITH_INSTALL_RPATH TRUE
)
```

For Nix builds, patchelf may be needed:

```bash
patchelf --set-rpath '$ORIGIN:/nix/store/...-qtbase/lib' your_plugin.so
```

---

## Step 5: Build Workflow

```bash
# 1. Build Rust cdylib
cd zone-sequencer-rs
cargo build --release
# produces target/release/libzone_sequencer_rs.so

# 2. Copy .so to module directory (or symlink)
cp target/release/libzone_sequencer_rs.so ../logos-zone-sequencer-module/lib/

# 3. Build Qt module
cd ../logos-zone-sequencer-module
make build-module

# 4. Install
make install-module
# copies both .so files + manifest to ~/.local/share/Logos/LogosAppNix/modules/
```

---

## zone-sdk Specifics

### Channel Identity

Channel ID = public key of Ed25519 signing key (NOT arbitrary hex).

Board identity derivation: `SHA256(name + ":" + secret)` → Ed25519 seed → signing key → channel ID.

```rust
use ed25519_dalek::SigningKey;
use sha2::{Sha256, Digest};

let seed = Sha256::digest(format!("{}:{}", name, secret).as_bytes());
let signing_key = SigningKey::from_bytes(&seed.into());
let channel_id = hex::encode(signing_key.verifying_key().to_bytes());
```

### Checkpoint After First Inscription

Checkpoint is mandatory after the first inscription on a new channel — without it, validators reject subsequent transactions.

### Querying with Recent-Slot Cursor

Using `None`/genesis cursor scans all blocks. Use a recent-slot cursor instead:

```rust
let tip_slot = indexer.get_tip().await?.slot;
let cursor_json = format!(r#"{{"slot":{},"last_id":null}}"#, tip_slot.saturating_sub(50000));
let cursor = serde_json::from_str::<Cursor>(&cursor_json).ok();
let messages = indexer.next_messages(cursor, limit).await?;
```

---

## Gotchas

| Issue | Fix |
|-------|-----|
| Rust panic crashes logos_host | Wrap all FFI functions in `panic::catch_unwind` |
| `tokio` deadlock in FFI call | Use global `OnceLock<Runtime>`, never create runtime inside `block_on` |
| `ZoneSequencer::init()` panics "no reactor running" | Must be called inside `block_on()` — it uses `tokio::spawn()` |
| "undefined symbol" loading UI plugin | Use `dlsym` for logos_core and Rust symbols in UI plugins |
| Rust .so not found at runtime | Set `INSTALL_RPATH "$ORIGIN"` in CMake |
| Memory leak from returned C strings | Always provide and call a `_free` function |
| Channel ID doesn't match explorer | Channel ID = pubkey bytes, not arbitrary hex — derive from signing key |
| Validator rejects transactions | Must checkpoint after first inscription on a new channel |
| Channel query returns empty | Use recent-slot cursor, not `None` (genesis scans all blocks) |
