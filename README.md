# After Effects MCP — Windows (CC 2018 to 2025+)

Model Context Protocol (MCP) server and Adobe CEP bridge for **Adobe After Effects (CC 2018 through CC 2025+)** on Windows 10/11.

Allows Google Antigravity to inspect, automate, and control Adobe After Effects projects, compositions, layers, solids, text, transforms, effects, keyframes, and the render queue using natural language.

---

## Architecture

```
Antigravity MCP Client
       │ (stdio transport)
       ▼
Node.js MCP Server (mcp-server/index.js)
       │ (HTTP loopback 127.0.0.1:17892, token-authenticated)
       ▼
After Effects CEP Panel (com.antigravity.aftereffects.mcp)
       │ (ExtendScript evaluation)
       ▼
After Effects ExtendScript Host (aftereffects.jsx)
       │
       ▼
Adobe After Effects (CC 2018 - 2025+)
```

---

## Supported Tools (32 Tools)

### System & Health
- `ae_ping`: Simple ping to check if server and local bridge are alive.
- `ae_health_check`: Comprehensive health check on AE process, CEP panel connection, and active project.

### Project & Compositions
- `get_project_info`: Inspect active AE project metadata (item counts, color depth, project file path).
- `save_project`: Save project safely or save as destination path.
- `list_compositions`: List all compositions with dimensions, frame rate, duration, layer count.
- `get_active_composition`: Get currently active composition settings and work area.
- `create_composition`: Create a new composition (name, width, height, pixelAspect, duration, frameRate).
- `get_composition_settings`: Retrieve detailed settings of a specific composition by ID or name.

### Media & Project Items
- `list_project_items`: List footage, folders, comps, and solids in Project panel.
- `import_media_to_project`: Import media files (video, audio, images) into the project.

### Layers
- `list_layers`: List all layers in a composition with time bounds, types, blending modes, and flags.
- `get_layer_info`: Full details of a specific layer including transform values and effects.
- `add_solid_layer`: Add a solid layer (color `[r, g, b]`, width, height, duration, name).
- `add_text_layer`: Add a text layer (text string, position, name).
- `add_media_layer`: Place imported project footage onto the composition timeline.
- `set_layer_transform`: Set position, scale, rotation, opacity, anchor point.
- `set_layer_opacity`: Set opacity (0-100%).
- `set_layer_blending_mode`: Set blending mode (Normal, Multiply, Screen, Overlay, Add, etc.).
- `split_or_trim_layer`: Trim inPoint, outPoint, startTime or split layer at time.
- `remove_layer`: Remove a layer (requires `confirm_removal: true`).
- `set_layer_enabled`: Toggle layer visibility/enabled state.

### Effects
- `list_layer_effects`: List applied effects and properties on a layer.
- `apply_effect`: Apply an effect to a layer (e.g., `ADBE Gaussian Blur 2`).
- `set_effect_property`: Set property value on an applied effect.
- `remove_effect`: Remove an applied effect from a layer.

### Keyframes
- `list_supported_keyframe_properties`: Inspect properties that support keyframing.
- `get_property_keyframes`: Retrieve keyframe times and values on a property.
- `add_property_keyframe`: Add or update a keyframe at time `t`.
- `remove_property_keyframe`: Remove a keyframe by index.

### Render Queue
- `get_render_queue_status`: Check render queue items and their status.
- `add_comp_to_render_queue`: Add a composition to render queue with output file path.
- `start_render_queue`: Trigger rendering of queued items (requires `confirm_render: true`).

---

## Quick Start

1. **Install CEP extension**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
   ```
2. **Open After Effects**:
   - Go to `Window` -> `Extensions` -> `After Effects MCP Bridge`.
   - The panel opens and shows connection status and active project/composition info.
3. **Run tests**:
   ```cmd
   npm test
   ```
4. **Diagnose**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\diagnose.ps1
   ```
