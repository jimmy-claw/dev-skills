# Building a Logos App IComponent Plugin

A complete guide to building a Qt/QML app as a Logos Core IComponent UI plugin for logos-app (Basecamp).

**Reference implementation:** [jimmy-claw/scala](https://github.com/jimmy-claw/scala) — Secure Calendar App

---

## Architecture Overview

```
logos-app (Basecamp)
  └── capability_module      ← built-in, handles auth/tokens
  └── kv_module              ← persistent key-value storage
  └── delivery_module        ← P2P messaging (Waku-based, reliable delivery)
  └── your_module            ← headless backend plugin (Qt Core/Qml/RemoteObjects only)
  └── your_ui (IComponent)   ← Qt Quick UI plugin loaded by logos-app
        └── YourBackend  → your_module via QtRO (storage, sync)
        └── YourSync     → delivery_module via QtRO (P2P messaging)
```

logos-app loads UI plugins as IComponent `.so` files. Each plugin can declare module dependencies — logos-app spins up those modules automatically when the plugin is activated.

---

## Part 1: IComponent UI Plugin

### C++ Structure

**`src/your_ui_component.h`**
```cpp
#pragma once
#include "i_component.h"          // from logos-cpp-sdk
#include <QtPlugin>

class YourUIComponent : public QObject, public IComponent {
    Q_OBJECT
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "ui_metadata.json")
    Q_INTERFACES(IComponent)
public:
    explicit YourUIComponent(QObject *parent = nullptr);
    QWidget* createWidget(LogosAPI* logosAPI) override;
    void destroyWidget(QWidget* widget) override;
};
```

**`src/your_ui_component.cpp`**
```cpp
QWidget* YourUIComponent::createWidget(LogosAPI* logosAPI) {
    auto* quickWidget = new QQuickWidget();
    quickWidget->setResizeMode(QQuickWidget::SizeRootObjectToView);

    auto* backend = new YourBackend();
    backend->setParent(quickWidget);

#ifdef LOGOS_CORE_AVAILABLE
    if (logosAPI) {
        backend->initLogos(logosAPI);  // connects to kv_module etc via QtRO
    }
#endif

    quickWidget->rootContext()->setContextProperty("backend", backend);
    quickWidget->setSource(QUrl("qrc:/your_app/Main.qml"));
    return quickWidget;
}
```

### QML Resources — CRITICAL

QML files must be embedded as Qt resources. Without this the widget loads blank.

In `CMakeLists.txt`:
```cmake
set(CMAKE_AUTORCC ON)   # ← REQUIRED, easy to miss
```

Create `qml/your_app.qrc`:
```xml
<RCC>
    <qresource prefix="/your_app">
        <file>Main.qml</file>
        <file>OtherView.qml</file>
    </qresource>
</RCC>
```

Add to the plugin target:
```cmake
add_library(your_ui SHARED
    src/your_ui_component.cpp
    qml/your_app.qrc     # ← AUTORCC processes this
)
```

### Plugin Metadata

**`ui_metadata.json`**:
```json
{
  "name": "your_ui",
  "version": "0.1.0",
  "type": "ui",
  "category": "productivity",
  "author": "your-github",
  "description": "Your app UI for Logos",
  "dependencies": ["your_module"],
  "main": {
    "linux-amd64": "your_ui.so",
    "linux-aarch64": "your_ui.so",
    "darwin-arm64": "your_ui.so"
  },
  "manifestVersion": "0.1.0"
}
```

### CMakeLists.txt — UI Plugin Section

```cmake
option(BUILD_UI_PLUGIN "Build IComponent UI plugin" OFF)

if(BUILD_UI_PLUGIN)
    set(CMAKE_AUTOMOC ON)
    set(CMAKE_AUTORCC ON)   # ← don't forget this

    find_package(Qt6 REQUIRED COMPONENTS Core Qml Quick QuickWidgets Widgets RemoteObjects)

    add_library(your_ui SHARED
        src/your_ui_component.cpp
        src/your_backend.cpp
        qml/your_app.qrc
    )

    target_compile_definitions(your_ui PRIVATE
        YOUR_UI_BUILD
        SCALA_UI_METADATA_FILE="${CMAKE_CURRENT_SOURCE_DIR}/ui_metadata.json"
    )

    target_include_directories(your_ui PRIVATE
        src
        "${LOGOS_CPP_SDK_ROOT}/include"
        "${LOGOS_CPP_SDK_ROOT}/include/cpp"
        "${LOGOS_LIBLOGOS_ROOT}/include"
    )

    target_link_libraries(your_ui PRIVATE
        Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickWidgets Qt6::Widgets
        Qt6::RemoteObjects
        logos_cpp_sdk
        logos_core
        ${LOGOS_SDK_LIB}
    )

    # Note: logos_sdk must come BEFORE Qt6::RemoteObjects in link order
    # (logos_sdk.a references RemoteObjects symbols — linker ordering matters)
    set_target_properties(your_ui PROPERTIES
        PREFIX ""
        OUTPUT_NAME "your_ui"
    )
endif()
```

### Q_PLUGIN_METADATA Conflict — Common Pitfall

If your project has multiple plugin targets (UI plugin + headless module plugin), each one **must** have exactly one `Q_PLUGIN_METADATA`. If your backend class also has it, you'll get a link error:

```
error: qt_plugin_query_metadata_v2() redefined
```

Fix: guard the backend's metadata with `#ifndef YOUR_UI_BUILD`:
```cpp
// in your_backend.h
#ifndef YOUR_UI_BUILD
    Q_PLUGIN_METADATA(IID PluginInterface_iid FILE "metadata.json")
#endif
```

---

## Part 2: Headless Module Plugin

The headless module runs inside `logos_host` (a separate process). It provides the backend logic via QtRO — the UI plugin connects to it remotely.

### CRITICAL: No Qt Quick in the headless plugin

The headless `.so` must **not** link Qt Quick or Qt Widgets. logos_host doesn't have a display. Build it with Qt Core + Qml + RemoteObjects only:

```cmake
option(BUILD_MODULE "Build headless logoscore plugin" OFF)

if(BUILD_MODULE)
    find_package(Qt6 REQUIRED COMPONENTS Core Qml RemoteObjects)
    # NO Quick, NO Widgets

    qt_add_plugin(your_headless_plugin CLASS_NAME YourPlugin)
    # ...
endif()
```

### Plugin Interface

```cpp
class YourPlugin : public QObject, public PluginInterface {
    Q_OBJECT
    Q_PLUGIN_METADATA(IID PluginInterface_iid FILE "metadata.json")
    Q_INTERFACES(PluginInterface)

public:
    Q_INVOKABLE QString version() const override { return "0.1.0"; }
    Q_INVOKABLE void initLogos(LogosAPI* api) override;

    // Your API methods — all Q_INVOKABLE for QtRO
    Q_INVOKABLE QString createItem(const QString& name);
    Q_INVOKABLE QString getItem(const QString& id);
    // etc.
};
```

**Everything the UI calls remotely must be `Q_INVOKABLE`.**

### Connecting to kv_module from initLogos

```cpp
void YourPlugin::initLogos(LogosAPI* api) {
    logosAPI = api;  // ← REQUIRED: set base class field

    auto* kvClient = api->getClient("kv_module");
    if (kvClient) {
        m_store.setClient(kvClient);
        // Switch to file backend for persistence
        kvClient->invokeRemoteMethod("kv_module", "setDataDir",
            QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/kv-data");
    }
}
```

**Key pitfall:** `logosAPI = api;` (the base class field) must be set or all ModuleProxy method calls return `false`.

### Module Manifest

**`metadata.json`** (used as module manifest):
```json
{
  "name": "your_module",
  "version": "0.1.0",
  "type": "core",
  "dependencies": ["kv_module", "delivery_module"],
  "main": "your_module_plugin",
  "description": "Your headless module"
}
```

---

## Part 3: kv_module — Persistent Storage

kv_module provides namespaced key-value storage. All methods are synchronous (via QtRO invoke with timeout).

```cpp
// set
kvClient->invokeRemoteMethod("kv_module", "set",
    ns, key, value);  // ns="your_app", key="item:uuid", value=jsonString

// get
QVariant result = kvClient->invokeRemoteMethod("kv_module", "get",
    ns, key);
QString json = result.toString();

// list all keys in namespace
QVariant list = kvClient->invokeRemoteMethod("kv_module", "listAll", ns);
// returns JSON array of key-value pairs

// remove
kvClient->invokeRemoteMethod("kv_module", "remove", ns, key);
```

### File Backend — Required for Persistence

By default kv_module uses MemoryBackend (data lost on restart). Call `setDataDir` to switch to FileBackend:

```cpp
// In initLogos(), after getting kv client:
kvClient->invokeRemoteMethod("kv_module", "setDataDir",
    QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/kv-data");
```

**Note:** `setDataDir` must be `Q_INVOKABLE` in kv_module. This was missing in early versions — fixed in [logos-kv-module PR#28](https://github.com/jimmy-claw/logos-kv-module/pull/28).

---

## Part 4: delivery_module — P2P Messaging

delivery_module wraps liblogosdelivery (Waku-based) for reliable P2P message delivery.

### API
```cpp
// Init (call once in initLogos)
deliveryClient->invokeRemoteMethod("delivery_module", "createNode",
    QString(R"({"logLevel":"INFO","mode":"Core","preset":"logos.dev"})"));
deliveryClient->invokeRemoteMethod("delivery_module", "start");

// Subscribe to a topic
deliveryClient->invokeRemoteMethod("delivery_module", "subscribe",
    QString("/your_app/1/%1/json").arg(channelId));

// Send a message
deliveryClient->invokeRemoteMethod("delivery_module", "send",
    topic, payloadString);

// Receive — register event handler
api->on("delivery_module", "messageReceived", [this](QVariantList args) {
    // args[0]=hash, args[1]=topic, args[2]=payload(base64), args[3]=timestamp
    QString payload = QByteArray::fromBase64(args[2].toString().toUtf8());
    // handle incoming message
});
```

### Content Topic Format
`/your_app/1/<channel-id>/json` — per [Logos messaging spec](https://lip.logos.co/messaging/informational/23/topics.html#content-topics)

### Install delivery_module
```bash
# Get lgpm
nix bundle --bundler github:logos-co/nix-bundle-dir#qtApp \
  github:logos-co/logos-package-manager-module#cli \
  --out-link /tmp/package-manager

# Install delivery_module
/tmp/package-manager/bin/lgpm \
  --release build-20260307-a751c91-69 \
  --modules-dir ~/.local/share/Logos/LogosAppNix/modules \
  install logos-delivery-module
```

---

## Part 5: Nix Flake Output

For the plugin to be usable from logos-workspace via `ws build`:

**`flake.nix`**:
```nix
{
  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nixpkgs.follows = "logos-module-builder/nixpkgs";
    logos-cpp-sdk = {
      url = "github:logos-co/logos-cpp-sdk";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    logos-liblogos = {
      url = "github:logos-co/logos-liblogos";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.logos-cpp-sdk.follows = "logos-cpp-sdk";
    };
  };

  outputs = { self, logos-module-builder, nixpkgs, logos-cpp-sdk, logos-liblogos, ... }:
    let
      moduleOutputs = logos-module-builder.lib.mkLogosModule {
        src = ./.;
        configFile = ./module.yaml;
      };
      forAllSystems = f: nixpkgs.lib.genAttrs
        [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ]
        (system: f {
          pkgs = import nixpkgs { inherit system; };
          logosSdk = logos-cpp-sdk.packages.${system}.default;
          logosLiblogos = logos-liblogos.packages.${system}.default;
        });
    in
    moduleOutputs // {
      packages = forAllSystems ({ pkgs, logosSdk, logosLiblogos }:
        let
          base = moduleOutputs.packages.${pkgs.system} or {};
          ui-plugin = pkgs.stdenv.mkDerivation {
            pname = "your-ui-plugin";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.cmake pkgs.ninja pkgs.qt6.wrapQtAppsHook ];
            buildInputs = [ pkgs.qt6.qtbase pkgs.qt6.qtdeclarative pkgs.qt6.qtremoteobjects ];
            cmakeFlags = [
              "-DBUILD_UI_PLUGIN=ON"
              "-DLOGOS_CPP_SDK_ROOT=${logosSdk}"
              "-DLOGOS_LIBLOGOS_ROOT=${logosLiblogos}"
            ];
            buildPhase = "cmake --build . --target your_ui -j$NIX_BUILD_CORES";
            installPhase = ''
              mkdir -p $out/lib
              cp your_ui.so $out/lib/
            '';
            dontWrapQtApps = true;
          };
        in base // { inherit ui-plugin; }
      );
    };
}
```

Build and test: `nix build 'path:/path/to/your/repo#ui-plugin'`

---

## Part 6: Makefile — Complete

```makefile
CMAKE_FLAGS ?= -DCMAKE_BUILD_TYPE=Debug

# Nix store Qt paths (auto-detected)
NIX_QTBASE   ?= $(shell ls -d /nix/store/*-qtbase-6.9.* 2>/dev/null | grep -v '\.drv$$' | grep -v dev | head -1)
NIX_QTDECL   ?= $(shell ls -d /nix/store/*-qtdeclarative-6.9.* 2>/dev/null | grep -v '\.drv$$' | grep -v dev | head -1)
NIX_QTREMOBJ ?= $(shell ls -d /nix/store/*-qtremoteobjects-6.9.* 2>/dev/null | grep -v '\.drv$$' | grep -v dev | head -1)
NIX_QT_PREFIX ?= $(NIX_QTBASE);$(NIX_QTDECL);$(NIX_QTREMOBJ)

# Nix SDK paths (auto-detected, split packages)
LOGOS_HEADERS_NIX     ?= $(shell ls -d /nix/store/*logos-liblogos-headers-* 2>/dev/null | grep -v '\.drv$$' | head -1)
LOGOS_LIB_NIX         ?= $(shell ls -d /nix/store/*logos-liblogos-lib-* 2>/dev/null | grep -v '\.drv$$' | head -1)
LOGOS_SDK_HEADERS_NIX ?= $(shell ls -d /nix/store/*logos-cpp-sdk-headers-* 2>/dev/null | grep -v '\.drv$$' | head -1)
LOGOS_SDK_LIB_NIX     ?= $(shell ls -d /nix/store/*logos-cpp-sdk-lib-* 2>/dev/null | grep -v '\.drv$$' | head -1)

BUILD_UI_PLUGIN ?= build-ui-plugin
BUILD_MODULE    ?= build-module

.PHONY: all build test clean setup-nix-merged \
        build-module build-ui-plugin install install-module \
        build-kv-module install-kv-module install-all

setup-nix-merged:
	rm -rf /tmp/logos-cpp-sdk-merged /tmp/logos-liblogos-merged
	mkdir -p /tmp/logos-cpp-sdk-merged/{include,lib} /tmp/logos-liblogos-merged/{include,lib}
	ln -sf $(LOGOS_SDK_HEADERS_NIX)/include/* /tmp/logos-cpp-sdk-merged/include/
	ln -sf $(LOGOS_SDK_LIB_NIX)/lib/* /tmp/logos-cpp-sdk-merged/lib/
	ln -sf $(LOGOS_HEADERS_NIX)/include/* /tmp/logos-liblogos-merged/include/
	ln -sf $(LOGOS_LIB_NIX)/lib/* /tmp/logos-liblogos-merged/lib/

build-ui-plugin: setup-nix-merged
	mkdir -p $(BUILD_UI_PLUGIN)
	cd $(BUILD_UI_PLUGIN) && cmake .. $(CMAKE_FLAGS) \
		-DBUILD_UI_PLUGIN=ON \
		-DLOGOS_CPP_SDK_ROOT=/tmp/logos-cpp-sdk-merged \
		-DLOGOS_LIBLOGOS_ROOT=/tmp/logos-liblogos-merged \
		$(if $(NIX_QTBASE),-DCMAKE_PREFIX_PATH="$(NIX_QT_PREFIX)" \
		  -DQT_ADDITIONAL_PACKAGES_PREFIX_PATH="$(NIX_QTDECL)$$(echo ';')$(NIX_QTREMOBJ)",) \
		&& cmake --build . --target your_ui -j$$(nproc)

install: build-ui-plugin
	mkdir -p ~/.local/share/Logos/LogosAppNix/plugins/your_ui
	cp $(BUILD_UI_PLUGIN)/your_ui.so ~/.local/share/Logos/LogosAppNix/plugins/your_ui/
	cp ui_metadata.json ~/.local/share/Logos/LogosAppNix/plugins/your_ui/manifest.json

build-module: setup-nix-merged
	mkdir -p $(BUILD_MODULE)
	cd $(BUILD_MODULE) && cmake .. $(CMAKE_FLAGS) \
		-DBUILD_MODULE=ON \
		-DLOGOS_CPP_SDK_ROOT=/tmp/logos-cpp-sdk-merged \
		-DLOGOS_LIBLOGOS_ROOT=/tmp/logos-liblogos-merged \
		$(if $(NIX_QTBASE),-DCMAKE_PREFIX_PATH="$(NIX_QT_PREFIX)" \
		  -DQT_ADDITIONAL_PACKAGES_PREFIX_PATH="$(NIX_QTDECL)$$(echo ';')$(NIX_QTREMOBJ)",) \
		&& cmake --build . --target your_headless_plugin -j$$(nproc)

install-module: build-module
	mkdir -p ~/.local/share/Logos/LogosAppNix/modules/your_module
	cp $(BUILD_MODULE)/your_module_plugin.so ~/.local/share/Logos/LogosAppNix/modules/your_module/
	cp metadata.json ~/.local/share/Logos/LogosAppNix/modules/your_module/manifest.json

KV_MODULE_DIR ?= /tmp/logos-kv-module
build-kv-module: setup-nix-merged
	rm -rf $(KV_MODULE_DIR)
	git clone --depth 1 https://github.com/jimmy-claw/logos-kv-module $(KV_MODULE_DIR)
	cd $(KV_MODULE_DIR) && cmake -B build \
		-DCMAKE_BUILD_TYPE=Release \
		-DLOGOS_CPP_SDK_ROOT=/tmp/logos-cpp-sdk-merged \
		-DLOGOS_LIBLOGOS_ROOT=/tmp/logos-liblogos-merged \
		$(if $(NIX_QTBASE),-DCMAKE_PREFIX_PATH="$(NIX_QT_PREFIX)" \
		  -DQT_ADDITIONAL_PACKAGES_PREFIX_PATH="$(NIX_QTDECL)$$(echo ';')$(NIX_QTREMOBJ)",) \
		&& cmake --build build -j$$(nproc)

install-kv-module: build-kv-module
	mkdir -p ~/.local/share/Logos/LogosAppNix/modules/kv_module
	cp $(KV_MODULE_DIR)/build/kv_module_plugin.so ~/.local/share/Logos/LogosAppNix/modules/kv_module/
	echo '{"name":"kv_module","version":"0.1.0","type":"core","category":"storage","dependencies":[],"main":{"linux-amd64":"kv_module_plugin.so"}}' \
	  > ~/.local/share/Logos/LogosAppNix/modules/kv_module/manifest.json

install-all: install install-module install-kv-module
	@echo "All installed. Run: cd ~/logos-workspace && nix run '.#logos-app-poc'"
```

---

## Part 7: Running logos-app

### Setup (one-time)
```bash
git clone git@github.com:logos-co/logos-workspace.git ~/logos-workspace
# No --recurse-submodules needed — nix handles deps
```

### Build and install your plugin
```bash
cd ~/your-app
make install-all
```

### Run
```bash
cd ~/logos-workspace
export PATH="$HOME/.nix-profile/bin:$PATH"
nix run '.#logos-app-poc'
```

Your plugin appears in the left sidebar. Click it to load.

---

## Gotchas Summary

| Issue | Fix |
|-------|-----|
| Blank white widget after click | `CMAKE_AUTORCC ON` missing — QML not embedded |
| `qt_plugin_query_metadata_v2 redefined` | Multiple `Q_PLUGIN_METADATA` in one .so — guard others with `#ifndef YOUR_UI_BUILD` |
| logos_host exits with code 1 | Linked Qt Quick in headless plugin — headless must use Qt Core/Qml/RemoteObjects only |
| All module methods return false | Missing `logosAPI = api;` in `initLogos()` (set the base class field!) |
| kv_module loses data on restart | Call `setDataDir` after getting kv client — switches to FileBackend |
| `setDataDir` not found via ModuleProxy | Must be `Q_INVOKABLE` — was missing in early kv_module, fixed in PR#28 |
| linker error: `Qt6RemoteObjects undefined` | Link `logos_sdk` before `Qt6::RemoteObjects` in CMake target_link_libraries |
| cmake target conflict `scala_module_plugin already exists` | BUILD_MODULE and BUILD_UI_PLUGIN share same CMakeLists — rename one target (e.g. `your_headless_plugin`) |
