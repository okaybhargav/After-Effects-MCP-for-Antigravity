# After Effects MCP for Antigravity

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Adobe After Effects](https://img.shields.io/badge/Adobe%20After%20Effects-CC%202018--2025%2B-blueviolet.svg)](https://www.adobe.com/products/aftereffects.html)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)

A production-grade **Model Context Protocol (MCP)** integration and **Adobe CEP Bridge** that connects **Google Antigravity** (and compatible MCP clients) directly to **Adobe After Effects (CC 2018 through CC 2025+)** on Windows 10/11.

It enables AI assistants to programmatically control After Effects: inspect projects, build compositions, create solid and text layers, manipulate transforms, apply visual effects, animate properties with keyframes, and automate render queue jobs using natural language.

---

## 📖 Table of Contents
- [What is it & Why Use It?](#-what-is-it--why-use-it)
- [How It Works (Architecture)](#-how-it-works-architecture)
- [Security & Reliability Features](#-security--reliability-features)
- [Supported Tools (32 Operations)](#-supported-tools-32-operations)
- [Prerequisites](#-prerequisites)
- [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
  - [Step 1: Clone the Repository](#step-1-clone-the-repository)
  - [Step 2: Install Node Dependencies](#step-2-install-node-dependencies)
  - [Step 3: Enable CEP Developer Mode (PlayerDebugMode)](#step-3-enable-cep-developer-mode-playerdebugmode)
  - [Step 4: Install the CEP Extension](#step-4-install-the-cep-extension)
  - [Step 5: Launch the Extension in After Effects](#step-5-launch-the-extension-in-after-effects)
  - [Step 6: Configure Google Antigravity](#step-6-configure-google-antigravity)
- [Verification & Diagnostics](#-verification--diagnostics)
- [Prompt Examples for Antigravity](#-prompt-examples-for-antigravity)
- [Project Structure](#-project-structure)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License](#-license)

---

## 💡 What is it & Why Use It?

Motion graphics, title animation, and VFX setups in After Effects can require hundreds of manual clicks. 

**After Effects MCP for Antigravity** exposes a safe, bidirectional bridge:
- Ask Antigravity to construct complex motion graphics, kinetic typography, lower-thirds, or logo stingers.
- Antigravity queries composition dimensions, creates layers, sets layer transforms and blend modes, applies effects, adds ease keyframes, and triggers exports.
- Antigravity acts as a pair-programmer and motion designer inside Adobe After Effects.

---

## 🏗️ How It Works (Architecture)

After Effects hosts its automation runtime inside an ES3 ExtendScript engine. Modern MCP clients, however, communicate via JSON-RPC 2.0 over `stdio`. This repository bridges the two environments safely:

```text
┌───────────────────────────────────────┐
│     Google Antigravity / MCP Client   │
└───────────────────┬───────────────────┘
                    │  (stdio JSON-RPC 2.0)
                    ▼
┌───────────────────────────────────────┐
│       Node.js MCP Server Process      │
│         (mcp-server/index.js)         │
│  - Parameter validation & sanitation  │
│  - Security token generation          │
└───────────────────┬───────────────────┘
                    │  (Loopback HTTP: 127.0.0.1:17892, Token Auth)
                    ▼
┌───────────────────────────────────────┐
│       After Effects CEP Panel         │
│ (com.antigravity.aftereffects.mcp)    │
│  - Dispatches to ExtendScript host    │
└───────────────────┬───────────────────┘
                    │  (window.__adobe_cep__.evalScript)
                    ▼
┌───────────────────────────────────────┐
│       ExtendScript Host Engine        │
│          (aftereffects.jsx)           │
└───────────────────┬───────────────────┘
                    │  (Direct app.project DOM API)
                    ▼
┌───────────────────────────────────────┐
│      Adobe After Effects Engine       │
│     Compositions, Layers, Renders     │
└───────────────────────────────────────┘
```

1. **Node.js MCP Server**: Started automatically by Antigravity. It starts a local loopback HTTP server on `127.0.0.1:17892`.
2. **Local Token Authentication**: A cryptographically random 256-bit token is generated and persisted locally in `.bridge-state.json`. Every request between the CEP panel and the server is authenticated.
3. **CEP 9+ Panel**: Runs inside After Effects (`Window > Extensions > After Effects MCP Bridge`). It maintains a heartbeat connection with the local HTTP server and executes actions via `evalScript`.
4. **ExtendScript Host**: Manipulates compositions, properties, effects, and the Render Queue in native After Effects memory.

---

## 🛡️ Security & Reliability Features

- **Strict Loopback Binding**: The bridge binds exclusively to `127.0.0.1` and immediately drops any external network or non-localhost traffic.
- **Constant-Time Token Comparison**: Protects against timing attacks using `crypto.timingSafeEqual`.
- **Whitelisted Actions**: Only pre-defined, rigorously sanitized actions are permitted. Arbitrary shell commands or unsanitized code evaluation are strictly blocked.
- **Destructive Operation Guards**: Critical actions (such as removing a layer or rendering queue items) require explicit confirmation flags (`confirm_removal: true`, `confirm_render: true`).

---

## ⚡ Supported Tools (32 Operations)

| Category | Available Tools |
|---|---|
| **System & Diagnostics** | `ae_ping`, `ae_health_check` |
| **Project & Compositions** | `get_project_info`, `save_project`, `list_compositions`, `get_active_composition`, `create_composition`, `get_composition_settings` |
| **Media & Assets** | `list_project_items`, `import_media_to_project` |
| **Layers & Layout** | `list_layers`, `get_layer_info`, `add_solid_layer`, `add_text_layer`, `add_media_layer`, `set_layer_transform`, `set_layer_opacity`, `set_layer_blending_mode`, `split_or_trim_layer`, `remove_layer`, `set_layer_enabled` |
| **Effects** | `list_layer_effects`, `apply_effect`, `set_effect_property`, `remove_effect` |
| **Keyframes & Animation** | `list_supported_keyframe_properties`, `get_property_keyframes`, `add_property_keyframe`, `remove_property_keyframe` |
| **Render Queue** | `get_render_queue_status`, `add_comp_to_render_queue`, `start_render_queue` |

---

## 📋 Prerequisites

- **Operating System**: Windows 10 or 11 (64-bit)
- **Adobe After Effects**: CC 2018, CC 2019, CC 2020, CC 2021, CC 2022, CC 2023, CC 2024, or CC 2025+
- **Node.js**: Node.js 18.x or later installed
- **MCP Client**: Google Antigravity, Claude Desktop, or Cursor

---

## 🚀 Step-by-Step Setup Guide

### Step 1: Clone the Repository
Open PowerShell or Command Prompt:
```powershell
git clone https://github.com/okaybhargav/After-Effects-MCP-for-Antigravity.git "C:\MCP\After Effect MCP"
cd "C:\MCP\After Effect MCP"
```

### Step 2: Install Node Dependencies
```powershell
npm install
```

### Step 3: Enable CEP Developer Mode (PlayerDebugMode)
Adobe CEP requires `PlayerDebugMode` to load local, unsigned developer panels. Run the following command in PowerShell:
```powershell
# Enables debug mode for CSXS 8 through 16 (covers CC 2018 through 2025+)
8..16 | ForEach-Object { reg add "HKCU\Software\Adobe\CSXS.$_" /v PlayerDebugMode /t REG_SZ /d 1 /f }
```

### Step 4: Install the CEP Extension
Run the bundled PowerShell install script:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```
This automatically deploys the extension folder to:
`%APPDATA%\Adobe\CEP\extensions\com.antigravity.aftereffects.mcp`

### Step 5: Launch the Extension in After Effects
1. Start **Adobe After Effects**.
2. Open any project or create a new one.
3. In the top menu, navigate to: **Window** > **Extensions** > **After Effects MCP Bridge**.
4. A panel will appear. When the MCP server runs, the status indicator will turn **Green (Connected)**.

### Step 6: Configure Google Antigravity
Open your Antigravity configuration file:
- File path: `C:\Users\<YourUsername>\.gemini\config\mcp_config.json`

Add the `after-effects` server to your `mcpServers` block:

```json
{
  "mcpServers": {
    "after-effects": {
      "command": "node",
      "args": [
        "C:\\MCP\\After Effect MCP\\mcp-server\\index.js"
      ]
    }
  }
}
```
*(Make sure to adjust the path to match where you cloned the repository).*

Restart Antigravity or refresh MCP tools.

---

## 🔍 Verification & Diagnostics

To verify your installation and test communication before making requests:

```powershell
# 1. Run diagnostic check (checks paths, registry, and process availability)
powershell -ExecutionPolicy Bypass -File scripts\diagnose.ps1

# 2. Run automated test suite
npm test
```

---

## 💬 Prompt Examples for Antigravity

- *"Check if After Effects is open and tell me which composition is currently active."*
- *"Create a 1920x1080 60fps composition named 'TitleStinger' with a duration of 5 seconds."*
- *"Add a black solid layer, then add a text layer with 'ANTIGRAVITY' in the center."*
- *"Apply 'ADBE Gaussian Blur 2' to the text layer and animate the blurriness from 40 to 0 between seconds 0 and 1.5."*
- *"Add the active comp to the Render Queue with output path 'C:\Exports\title.mov' and verify its status."*

---

## 📁 Project Structure

```text
After-Effects-MCP-for-Antigravity/
├── cep-extension/
│   ├── CSXS/manifest.xml         # CEP 9+ manifest (CSXS version definitions)
│   ├── host/aftereffects.jsx     # ExtendScript host automation functions
│   ├── index.html                # Panel UI
│   ├── panel.js                  # CEP bridge client and HTTP polling
│   └── styles.css                # Dark theme styling
├── mcp-server/
│   ├── index.js                  # MCP stdio server entry point
│   ├── bridge.js                 # Local 127.0.0.1:17892 HTTP bridge with auth
│   ├── tools.js                  # 32 MCP tool definitions, JSON schemas, handlers
│   └── validation.js             # Strict input validation and sanitization
├── scripts/
│   ├── install.ps1               # Installs CEP extension to %APPDATA%
│   ├── diagnose.ps1              # Full environment & bridge diagnostics
│   └── uninstall.ps1             # Clean uninstaller
├── tests/
│   ├── bridge.test.js            # Loopback HTTP and token auth unit tests
│   └── validation.test.js        # Input schema and bounds test suite
├── package.json                  # Node dependencies & test scripts
├── .gitignore                    # Excludes node_modules and bridge runtime state
├── LICENSE                       # MIT Open-Source License
└── README.md                     # Documentation
```

---

## ❓ Troubleshooting & FAQ

### 1. The extension does not appear under `Window > Extensions`
- **Fix**: Confirm that you ran `scripts\install.ps1` and that `PlayerDebugMode=1` is set for your CSXS version. Make sure to restart After Effects completely after installing.

### 2. Panel shows "Disconnected" or "Searching for Bridge"
- **Fix**: The panel connects when Antigravity starts the MCP server. Ensure Antigravity is running and has the `after-effects` server configured in `mcp_config.json`. You can also test manually by running `node mcp-server\index.js` in a terminal.

### 3. Port 17892 conflict
- **Fix**: If port 17892 is occupied by another application, you can specify an alternate port via the `AE_MCP_PORT` environment variable.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - free for personal and commercial open-source use.
