"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  ALLOWED_ACTIONS,
  findAfterEffectsExe,
  validateWindowsPath,
  ValidationError
} = require("./validation");

/**
 * Safely checks whether Adobe After Effects (AfterFX.exe) is currently running on Windows.
 */
function checkAfterEffectsProcessRunning() {
  try {
    const out = execFileSync(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq AfterFX.exe", "/NH", "/FO", "CSV"],
      { encoding: "utf8", timeout: 3000, windowsHide: true }
    );
    return out.toLowerCase().includes("afterfx.exe");
  } catch (_) {
    return false;
  }
}

/**
 * Creates a timestamped backup copy of a saved .aep file on disk before risky modifications.
 */
function createProjectBackupFile(projectPath) {
  if (!projectPath || typeof projectPath !== "string") {
    return null;
  }
  const cleanPath = projectPath.trim().replace(/^\\\\\?\\(?=[a-zA-Z]:[\\/])/, "");
  if (!fs.existsSync(cleanPath)) {
    return null;
  }
  const parsed = path.parse(cleanPath);
  const backupDir = path.join(parsed.dir, ".ae_mcp_backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${parsed.name}_backup_${ts}${parsed.ext}`;
  const backupDest = path.join(backupDir, backupName);
  try {
    fs.copyFileSync(cleanPath, backupDest);
    return backupDest;
  } catch (_e) {
    return null;
  }
}

const TOOL_DEFINITIONS = [
  {
    name: "ae_ping",
    description: "Pings the After Effects MCP server and local bridge to verify service responsiveness.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "ae_health_check",
    description: "Performs a comprehensive health check on Adobe After Effects (2018-2025+), the CEP panel bridge, and active project.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "get_project_info",
    description: "Retrieves metadata and status of the currently open Adobe After Effects project (name, path, items count, color depth).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "save_project",
    description: "Saves the current Adobe After Effects project safely, optionally specifying a destination path.",
    inputSchema: {
      type: "object",
      properties: {
        destination_path: {
          type: "string",
          description: "Optional destination .aep file path to save as. If omitted, saves to the current file."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "list_compositions",
    description: "Lists all compositions in the current After Effects project with their dimensions, frame rates, durations, and layer counts.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "get_active_composition",
    description: "Gets the currently active/selected composition in After Effects and its configuration.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "create_composition",
    description: "Creates a new composition in Adobe After Effects.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the new composition." },
        width: { type: "integer", description: "Width in pixels (default: 1920)." },
        height: { type: "integer", description: "Height in pixels (default: 1080)." },
        pixel_aspect: { type: "number", description: "Pixel aspect ratio (default: 1.0)." },
        duration: { type: "number", description: "Duration in seconds (default: 30.0)." },
        frame_rate: { type: "number", description: "Frame rate (default: 30.0)." }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "get_composition_settings",
    description: "Retrieves detailed settings for a composition specified by composition_id or composition_name.",
    inputSchema: {
      type: "object",
      properties: {
        composition_id: { type: "integer", description: "Project item ID of the composition." },
        composition_name: { type: "string", description: "Name of the composition if ID is not known." }
      },
      additionalProperties: false
    }
  },
  {
    name: "list_project_items",
    description: "Lists all items in the After Effects Project panel (footage, comps, solids, folders).",
    inputSchema: {
      type: "object",
      properties: {
        filter_type: {
          type: "string",
          enum: ["all", "composition", "footage", "folder", "solid"],
          description: "Filter items by type (default: 'all')."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "import_media_to_project",
    description: "Imports video, audio, or image files into the After Effects project.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Single absolute Windows path to media file." },
        file_paths: {
          type: "array",
          items: { type: "string" },
          description: "Array of absolute Windows paths to import multiple media files."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "list_layers",
    description: "Lists all layers in the active or specified composition.",
    inputSchema: {
      type: "object",
      properties: {
        composition_id: { type: "integer", description: "Optional composition item ID. Defaults to active comp." },
        composition_name: { type: "string", description: "Optional composition name." }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_layer_info",
    description: "Retrieves full details of a specific layer in a composition (transform, properties, effects).",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      additionalProperties: false
    }
  },
  {
    name: "add_solid_layer",
    description: "Creates and adds a solid layer to the composition.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the solid layer (default: 'Solid')." },
        color: {
          type: "array",
          items: { type: "number" },
          description: "[R, G, B] color values between 0.0 and 1.0. Example: [1, 0, 0] for red."
        },
        width: { type: "integer", description: "Width in pixels (defaults to comp width)." },
        height: { type: "integer", description: "Height in pixels (defaults to comp height)." },
        pixel_aspect: { type: "number", description: "Pixel aspect ratio (default: 1.0)." },
        duration: { type: "number", description: "Duration in seconds (defaults to comp duration)." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      additionalProperties: false
    }
  },
  {
    name: "add_text_layer",
    description: "Creates and adds a text layer to the composition.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text content to display." },
        name: { type: "string", description: "Layer name (optional)." },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [X, Y] coordinates in pixels."
        },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["text"],
      additionalProperties: false
    }
  },
  {
    name: "add_media_layer",
    description: "Adds an imported footage item from the Project panel to the composition timeline.",
    inputSchema: {
      type: "object",
      properties: {
        project_item_id: { type: "integer", description: "ID of the media item in the project." },
        project_item_name: { type: "string", description: "Name of the media item in the project." },
        composition_id: { type: "integer", description: "Optional composition item ID." },
        start_time: { type: "number", description: "Time in seconds at which the layer begins (default: 0)." }
      },
      additionalProperties: false
    }
  },
  {
    name: "set_layer_transform",
    description: "Modifies transform properties of a layer (Position, Scale, Rotation, Opacity, Anchor Point).",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        composition_id: { type: "integer", description: "Optional composition item ID." },
        position: { type: "array", items: { type: "number" }, description: "[X, Y] or [X, Y, Z] position." },
        scale: { type: "array", items: { type: "number" }, description: "[X, Y] or [X, Y, Z] percentage scale (e.g. [100, 100])." },
        rotation: { type: "number", description: "Rotation in degrees." },
        anchor_point: { type: "array", items: { type: "number" }, description: "[X, Y] or [X, Y, Z] anchor point." },
        opacity: { type: "number", description: "Opacity percentage (0-100)." }
      },
      additionalProperties: false
    }
  },
  {
    name: "set_layer_opacity",
    description: "Sets the opacity percentage (0-100) of a layer.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        opacity: { type: "number", description: "Opacity from 0 to 100." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["opacity"],
      additionalProperties: false
    }
  },
  {
    name: "set_layer_blending_mode",
    description: "Sets the blending mode of a layer (e.g. Normal, Multiply, Screen, Overlay, Add).",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        mode: { type: "string", description: "Blending mode name." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["mode"],
      additionalProperties: false
    }
  },
  {
    name: "split_or_trim_layer",
    description: "Trims or splits a layer by adjusting inPoint, outPoint, startTime, or splitting at time.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        in_point: { type: "number", description: "New In Point in seconds." },
        out_point: { type: "number", description: "New Out Point in seconds." },
        start_time: { type: "number", description: "New Start Time in seconds." },
        split_at_time: { type: "number", description: "Time in seconds to split layer into two." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      additionalProperties: false
    }
  },
  {
    name: "remove_layer",
    description: "Removes a layer from the composition. Requires confirm_removal: true.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        composition_id: { type: "integer", description: "Optional composition item ID." },
        confirm_removal: { type: "boolean", description: "Must be set to true to execute destructive layer removal." }
      },
      required: ["confirm_removal"],
      additionalProperties: false
    }
  },
  {
    name: "set_layer_enabled",
    description: "Enables or disables (shows/hides) a layer in the composition.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        enabled: { type: "boolean", description: "true to enable (show), false to disable (hide)." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["enabled"],
      additionalProperties: false
    }
  },
  {
    name: "list_layer_effects",
    description: "Lists all applied effects on a layer along with their parameter names.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      additionalProperties: false
    }
  },
  {
    name: "apply_effect",
    description: "Applies an effect to a layer (e.g. 'ADBE Gaussian Blur 2', 'ADBE Hue/Saturation', 'Fast Blur').",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        effect_name: { type: "string", description: "Match name or display name of the effect (e.g. 'ADBE Gaussian Blur 2')." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["effect_name"],
      additionalProperties: false
    }
  },
  {
    name: "set_effect_property",
    description: "Sets the value of a property on an effect applied to a layer.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        effect_name: { type: "string", description: "1-based index or name of the effect." },
        property_name: { type: "string", description: "1-based index or name of the property." },
        value: { description: "Value to set (number, array, or boolean)." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["effect_name", "property_name", "value"],
      additionalProperties: false
    }
  },
  {
    name: "remove_effect",
    description: "Removes an applied effect from a layer.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        effect_name: { type: "string", description: "1-based index or name of the effect." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["effect_name"],
      additionalProperties: false
    }
  },
  {
    name: "list_supported_keyframe_properties",
    description: "Lists keyframeable properties available on a layer (e.g. Position, Scale, Rotation, Opacity, Effects).",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_property_keyframes",
    description: "Retrieves existing keyframes on a property (times, values).",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        property_group: { type: "string", description: "'Transform' or effect name." },
        property_name: { type: "string", description: "Property name (e.g. 'Position', 'Scale', 'Opacity', 'Rotation')." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["property_name"],
      additionalProperties: false
    }
  },
  {
    name: "add_property_keyframe",
    description: "Adds or updates a keyframe on a layer property at a specified time.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        property_group: { type: "string", description: "'Transform' or effect name. Default: 'Transform'." },
        property_name: { type: "string", description: "Property name (e.g. 'Position', 'Scale', 'Opacity', 'Rotation')." },
        time: { type: "number", description: "Time in seconds for the keyframe." },
        value: { description: "Value at keyframe (number or array)." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["property_name", "time", "value"],
      additionalProperties: false
    }
  },
  {
    name: "remove_property_keyframe",
    description: "Removes a keyframe at a specified index or time.",
    inputSchema: {
      type: "object",
      properties: {
        layer_index: { type: "integer", description: "1-based index of the layer." },
        layer_name: { type: "string", description: "Name of the layer." },
        property_group: { type: "string", description: "'Transform' or effect name." },
        property_name: { type: "string", description: "Property name." },
        keyframe_index: { type: "integer", description: "1-based keyframe index to remove." },
        composition_id: { type: "integer", description: "Optional composition item ID." }
      },
      required: ["property_name", "keyframe_index"],
      additionalProperties: false
    }
  },
  {
    name: "get_render_queue_status",
    description: "Retrieves the status of items in the After Effects Render Queue.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "add_comp_to_render_queue",
    description: "Adds a composition to the Render Queue with an optional output file path.",
    inputSchema: {
      type: "object",
      properties: {
        composition_id: { type: "integer", description: "Project item ID of composition." },
        composition_name: { type: "string", description: "Name of composition." },
        output_file_path: { type: "string", description: "Absolute path for rendered output file." }
      },
      additionalProperties: false
    }
  },
  {
    name: "start_render_queue",
    description: "Starts rendering queued items in the After Effects Render Queue. Requires confirm_render: true.",
    inputSchema: {
      type: "object",
      properties: {
        confirm_render: {
          type: "boolean",
          description: "Must be set to true to trigger Render Queue rendering."
        }
      },
      required: ["confirm_render"],
      additionalProperties: false
    }
  },
  {
    name: "execute_extendscript",
    description: "Executes ExtendScript (JSX) code directly in Adobe After Effects and returns the result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "ExtendScript code to evaluate in After Effects."
        }
      },
      required: ["script"],
      additionalProperties: false
    }
  }
];

/**
 * Maps incoming MCP tool calls to After Effects bridge actions.
 */
async function executeToolCall(bridge, toolName, args = {}) {
  switch (toolName) {
    case "ae_ping": {
      return {
        ok: true,
        pong: true,
        timestamp: new Date().toISOString(),
        bridgeMode: bridge.mode,
        port: bridge.port,
        panelConnected: bridge.isPanelConnected()
      };
    }

    case "ae_health_check": {
      const isConnected = bridge.isPanelConnected();
      const aeExe = findAfterEffectsExe();
      const aeRunning = checkAfterEffectsProcessRunning();
      let hostDetails = null;

      if (isConnected) {
        try {
          hostDetails = await bridge.execute("ae_health_check", {}, 4000);
        } catch (_err) {
          hostDetails = { error: _err.message };
        }
      }

      return {
        ok: true,
        service: "After Effects MCP Bridge",
        supportedVersions: "Adobe After Effects CC 2018 through 2025+",
        detectedExecutable: aeExe,
        afterEffectsProcessRunning: aeRunning,
        bridgePort: bridge.port,
        bridgeMode: bridge.mode,
        panelConnected: isConnected,
        lastPanelPollAt: bridge.lastPanelPollAt ? new Date(bridge.lastPanelPollAt).toISOString() : null,
        hostDetails
      };
    }

    case "get_project_info":
      return await bridge.execute("get_project_info", {});

    case "save_project":
      return await bridge.execute("save_project", {
        destinationPath: args.destination_path
      });

    case "list_compositions":
      return await bridge.execute("list_compositions", {});

    case "get_active_composition":
      return await bridge.execute("get_active_composition", {});

    case "create_composition":
      return await bridge.execute("create_composition", {
        name: args.name,
        width: args.width,
        height: args.height,
        pixelAspect: args.pixel_aspect,
        duration: args.duration,
        frameRate: args.frame_rate
      });

    case "get_composition_settings":
      return await bridge.execute("get_composition_settings", {
        compositionId: args.composition_id,
        compositionName: args.composition_name
      });

    case "list_project_items":
      return await bridge.execute("list_project_items", {
        filterType: args.filter_type
      });

    case "import_media_to_project":
      return await bridge.execute("import_media_to_project", {
        filePath: args.file_path,
        filePaths: args.file_paths
      });

    case "list_layers":
      return await bridge.execute("list_layers", {
        compositionId: args.composition_id,
        compositionName: args.composition_name
      });

    case "get_layer_info":
      return await bridge.execute("get_layer_info", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        compositionId: args.composition_id
      });

    case "add_solid_layer":
      return await bridge.execute("add_solid_layer", {
        name: args.name,
        color: args.color,
        width: args.width,
        height: args.height,
        pixelAspect: args.pixel_aspect,
        duration: args.duration,
        compositionId: args.composition_id
      });

    case "add_text_layer":
      return await bridge.execute("add_text_layer", {
        text: args.text,
        name: args.name,
        position: args.position,
        compositionId: args.composition_id
      });

    case "add_media_layer":
      return await bridge.execute("add_media_layer", {
        projectItemId: args.project_item_id,
        projectItemName: args.project_item_name,
        compositionId: args.composition_id,
        startTime: args.start_time
      });

    case "set_layer_transform":
      return await bridge.execute("set_layer_transform", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        compositionId: args.composition_id,
        position: args.position,
        scale: args.scale,
        rotation: args.rotation,
        anchorPoint: args.anchor_point,
        opacity: args.opacity
      });

    case "set_layer_opacity":
      return await bridge.execute("set_layer_opacity", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        opacity: args.opacity,
        compositionId: args.composition_id
      });

    case "set_layer_blending_mode":
      return await bridge.execute("set_layer_blending_mode", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        mode: args.mode,
        compositionId: args.composition_id
      });

    case "split_or_trim_layer":
      return await bridge.execute("split_or_trim_layer", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        inPoint: args.in_point,
        outPoint: args.out_point,
        startTime: args.start_time,
        splitAtTime: args.split_at_time,
        compositionId: args.composition_id
      });

    case "remove_layer":
      return await bridge.execute("remove_layer", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        compositionId: args.composition_id,
        confirmRemoval: args.confirm_removal
      });

    case "set_layer_enabled":
      return await bridge.execute("set_layer_enabled", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        enabled: args.enabled,
        compositionId: args.composition_id
      });

    case "list_layer_effects":
      return await bridge.execute("list_layer_effects", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        compositionId: args.composition_id
      });

    case "apply_effect":
      return await bridge.execute("apply_effect", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        effectMatchName: args.effect_name,
        compositionId: args.composition_id
      });

    case "set_effect_property":
      return await bridge.execute("set_effect_property", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        effectIndexOrName: args.effect_name,
        propertyIndexOrName: args.property_name,
        value: args.value,
        compositionId: args.composition_id
      });

    case "remove_effect":
      return await bridge.execute("remove_effect", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        effectIndexOrName: args.effect_name,
        compositionId: args.composition_id
      });

    case "list_supported_keyframe_properties":
      return await bridge.execute("list_supported_keyframe_properties", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        compositionId: args.composition_id
      });

    case "get_property_keyframes":
      return await bridge.execute("get_property_keyframes", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        propertyGroup: args.property_group,
        propertyName: args.property_name,
        compositionId: args.composition_id
      });

    case "add_property_keyframe":
      return await bridge.execute("add_property_keyframe", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        propertyGroup: args.property_group,
        propertyName: args.property_name,
        time: args.time,
        value: args.value,
        compositionId: args.composition_id
      });

    case "remove_property_keyframe":
      return await bridge.execute("remove_property_keyframe", {
        layerIndex: args.layer_index,
        layerName: args.layer_name,
        propertyGroup: args.property_group,
        propertyName: args.property_name,
        keyframeIndex: args.keyframe_index,
        compositionId: args.composition_id
      });

    case "get_render_queue_status":
      return await bridge.execute("get_render_queue_status", {});

    case "add_comp_to_render_queue":
      return await bridge.execute("add_comp_to_render_queue", {
        compositionId: args.composition_id,
        compositionName: args.composition_name,
        outputFilePath: args.output_file_path
      });

    case "start_render_queue":
      return await bridge.execute("start_render_queue", {
        confirmRender: args.confirm_render
      });

    case "execute_extendscript":
      return await bridge.execute("execute_extendscript", {
        script: args.script
      });

    default:
      throw new ValidationError(`Unknown tool name: ${toolName}`);
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeToolCall,
  checkAfterEffectsProcessRunning,
  createProjectBackupFile
};
