# logos-qt-mcp

Qt Inspector + MCP server + test framework for headless UI testing of Logos App plugins.

**Repo:** https://github.com/logos-co/logos-qt-mcp

## Architecture

```
┌─────────────────┐  TCP/JSON   ┌──────────────┐  stdio/MCP  ┌─────────────┐
│ LogosApp +      │◄───────────►│ MCP Server   │◄───────────►│ Claude /    │
│ InspectorServer │  port 3768  │ index.mjs    │             │ AI Agent    │
└─────────────────┘             └──────────────┘             └─────────────┘
```

- **InspectorServer** — C++ TCP server embedded in the Qt app (port 3768). Exposes the QML tree, screenshots, click/type actions via JSON messages.
- **MCP Server** — Node.js bridge that translates MCP tool calls into TCP/JSON commands for the InspectorServer.
- **Test Framework** — `framework.mjs` provides `test()` and `run()` helpers for writing integration tests.

## Enabling the Inspector

### In logos-basecamp (pre-configured)

```bash
nix build .#x86_64-linux.appDistributedWithInspector -o result-app
```

### In your own Qt app

```bash
cmake .. -DENABLE_QML_INSPECTOR=ON -DLOGOS_QT_MCP_ROOT=$(pwd)/logos-qt-mcp
```

Then in your main.cpp:

```cpp
#include "InspectorServer.h"

// After creating your main window:
InspectorServer::attach(mainWindow);
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `qml_get_tree` | Get the full QML object tree (types, properties, geometry) |
| `qml_screenshot` | Take a PNG screenshot of the app |
| `qml_click` | Click an element by text, objectName, or coordinates |
| `qml_evaluate` | Evaluate arbitrary JavaScript in the QML context |
| `qml_list_interactive` | List all clickable/interactive elements |
| `qml_find_and_click` | Find an element by text and click it |

## Test Framework

Build the test framework:

```bash
cd ~/logos-basecamp
nix build .#x86_64-linux.logosQtMcp -o result-mcp
```

Write tests in `tests/ui-tests.mjs`:

```javascript
import { test, run } from "./result-mcp/test-framework/framework.mjs";

test("my_module: verify UI loads", async (app) => {
  await app.click("my_module");              // click sidebar item
  await app.expectTexts(["expected text"]);   // assert text visible
  await app.screenshot();                    // capture PNG
});

test("my_module: interact with controls", async (app) => {
  await app.click("Submit");
  await app.expectAbsent("Error");
});

run();
```

### Available API

**Actions:** `app.click()`, `app.type()`, `app.findByType()`, `app.screenshot()`, `app.evaluate()`

**Assertions:** `app.expectTexts()`, `app.expectAbsent()`

## Scaffold Integration

The [logos-ui-module-scaffold](https://github.com/nicegoodthings/logos-ui-module-scaffold) includes ready-to-use test infrastructure:

```
tests/
├── ui-tests.mjs    # Your test cases
├── run-tests.sh    # Build framework + run tests (app must be running)
└── ci-test.sh      # Full headless CI: Xvfb + app + MCP + tests + cleanup
```

```bash
# Interactive (app already running)
./tests/run-tests.sh

# Headless CI
./tests/ci-test.sh
```

## CI Pipeline (Headless)

Full headless pipeline using Xvfb:

```bash
# 1. Build everything
nix build .#x86_64-linux.logosQtMcp -o result-mcp
nix build .#x86_64-linux.appDistributedWithInspector -o result-app

# 2. Virtual display
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# 3. Launch app + MCP server
./result-app/bin/logos-basecamp &
node result-mcp/mcp-server/index.mjs &

# 4. Run tests
node tests/ui-tests.mjs

# 5. Cleanup
kill %1 %2; pkill -f "Xvfb :99"
```

## Connecting MCP to Claude

Add to `~/.config/claude-desktop/mcp.json`:

```json
{
  "mcpServers": {
    "logos-qt-inspector": {
      "command": "node",
      "args": ["/path/to/result-mcp/mcp-server/index.mjs"]
    }
  }
}
```

Or use via OpenClaw agent with the MCP server running.

## Real Examples

- **Basecamp tests:** `~/logos-basecamp/tests/ui-tests.mjs`
- **Scaffold tests:** `~/logos-ui-module-scaffold/tests/ui-tests.mjs`

## See Also

- `dev-skills/logos-module-building/` — Building IComponent UI plugins
- `dev-skills/logos-module-build/` — Module build checklist
