"use strict";

const path = require("path");
const fs = require("fs");

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

const ALLOWED_ACTIONS = new Set([
  "ae_ping",
  "ae_health_check",
  "get_project_info",
  "save_project",
  "list_compositions",
  "get_active_composition",
  "create_composition",
  "get_composition_settings",
  "list_project_items",
  "import_media_to_project",
  "list_layers",
  "get_layer_info",
  "add_solid_layer",
  "add_text_layer",
  "add_media_layer",
  "set_layer_transform",
  "set_layer_opacity",
  "set_layer_blending_mode",
  "split_or_trim_layer",
  "remove_layer",
  "set_layer_enabled",
  "list_layer_effects",
  "apply_effect",
  "set_effect_property",
  "remove_effect",
  "list_supported_keyframe_properties",
  "get_property_keyframes",
  "add_property_keyframe",
  "remove_property_keyframe",
  "get_render_queue_status",
  "add_comp_to_render_queue",
  "start_render_queue",
  "execute_extendscript"
]);

const ALLOWED_BLENDING_MODES = [
  "Normal",
  "Dissolve",
  "Dancing Dissolve",
  "Darken",
  "Multiply",
  "Color Burn",
  "Classic Color Burn",
  "Linear Burn",
  "Darker Color",
  "Add",
  "Lighten",
  "Screen",
  "Color Dodge",
  "Classic Color Dodge",
  "Linear Dodge",
  "Lighter Color",
  "Overlay",
  "Soft Light",
  "Hard Light",
  "Vivid Light",
  "Linear Light",
  "Pin Light",
  "Hard Mix",
  "Difference",
  "Classic Difference",
  "Exclusion",
  "Subtract",
  "Divide",
  "Hue",
  "Saturation",
  "Color",
  "Luminosity",
  "Stencil Alpha",
  "Stencil Luma",
  "Silhouette Alpha",
  "Silhouette Luma",
  "Alpha Add",
  "Luminescent Premul"
];

const AE_2019_EXE =
  "C:\\Program Files\\Adobe\\Adobe After Effects CC 2019\\Support Files\\AfterFX.exe";

/**
 * Searches for any installed Adobe After Effects executable (2018 through 2025+).
 */
function findAfterEffectsExe() {
  if (fs.existsSync(AE_2019_EXE)) {
    return AE_2019_EXE;
  }
  var baseDir = "C:\\Program Files\\Adobe";
  if (fs.existsSync(baseDir)) {
    var entries = fs.readdirSync(baseDir);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (/After Effects/i.test(entry)) {
        var candidate = path.join(baseDir, entry, "Support Files", "AfterFX.exe");
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/**
 * Validates local Windows file/folder paths.
 */
function validateWindowsPath(filePath, fieldName = "path", options = {}) {
  const { mustExist = false, allowDirectory = false } = options;

  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new ValidationError(`Parameter '${fieldName}' must be a non-empty string.`, fieldName);
  }

  const trimmed = filePath.trim();

  if (trimmed.includes("\0")) {
    throw new ValidationError(`Path '${fieldName}' contains illegal null bytes.`, fieldName);
  }

  // Reject UNC network paths
  if (trimmed.startsWith("\\\\") || trimmed.startsWith("//")) {
    throw new ValidationError(`Network UNC paths are not supported for '${fieldName}'. Use local drives.`, fieldName);
  }

  // Must be an absolute Windows drive path (e.g. C:\... or C:/...)
  if (!/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    throw new ValidationError(`Parameter '${fieldName}' must be an absolute Windows path (e.g. C:\\...).`, fieldName);
  }

  const normalized = path.normalize(trimmed);

  if (mustExist) {
    if (!fs.existsSync(normalized)) {
      throw new ValidationError(`File not found at '${normalized}' for '${fieldName}'.`, fieldName);
    }
    const stat = fs.statSync(normalized);
    if (!allowDirectory && stat.isDirectory()) {
      throw new ValidationError(`Path '${normalized}' is a directory, but a file is required for '${fieldName}'.`, fieldName);
    }
  }

  return normalized;
}

/**
 * Prevents prototype pollution attacks.
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 6) return {};
  if (!obj || typeof obj !== "object") return obj;

  const clean = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new ValidationError(`Illegal property name '${key}' detected in request parameters.`, key);
    }
    const val = obj[key];
    if (val && typeof val === "object") {
      clean[key] = sanitizeObject(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Validates any After Effects bridge command before dispatching to ExtendScript.
 */
function validateBridgeCommand(command) {
  if (!command || typeof command !== "object") {
    throw new ValidationError("Command must be an object.");
  }

  if (typeof command.action !== "string" || !ALLOWED_ACTIONS.has(command.action)) {
    throw new ValidationError(
      `Unknown or unsupported action '${command.action}'. Allowed actions: ${Array.from(ALLOWED_ACTIONS).join(", ")}`,
      "action"
    );
  }

  const params = command.params ? sanitizeObject(command.params) : {};

  switch (command.action) {
    case "create_composition": {
      if (params.name !== undefined && (typeof params.name !== "string" || !params.name.trim())) {
        throw new ValidationError("Composition name must be a non-empty string.", "name");
      }
      if (params.width !== undefined) {
        const w = Number(params.width);
        if (!Number.isInteger(w) || w < 4 || w > 30000) {
          throw new ValidationError("Width must be an integer between 4 and 30000 pixels.", "width");
        }
      }
      if (params.height !== undefined) {
        const h = Number(params.height);
        if (!Number.isInteger(h) || h < 4 || h > 30000) {
          throw new ValidationError("Height must be an integer between 4 and 30000 pixels.", "height");
        }
      }
      if (params.duration !== undefined) {
        const d = Number(params.duration);
        if (isNaN(d) || d <= 0 || d > 108000) {
          throw new ValidationError("Duration must be a positive number in seconds (max 108000s).", "duration");
        }
      }
      if (params.frameRate !== undefined) {
        const fps = Number(params.frameRate);
        if (isNaN(fps) || fps < 1 || fps > 120) {
          throw new ValidationError("Frame rate must be between 1 and 120 fps.", "frameRate");
        }
      }
      break;
    }

    case "add_solid_layer": {
      if (params.color !== undefined) {
        if (!Array.isArray(params.color) || params.color.length < 3) {
          throw new ValidationError("Solid color must be an array of 3 numbers [r, g, b] between 0 and 1.", "color");
        }
        for (const c of params.color) {
          const num = Number(c);
          if (isNaN(num) || num < 0 || num > 1) {
            throw new ValidationError("Each color component in [r, g, b] must be a float between 0.0 and 1.0.", "color");
          }
        }
      }
      break;
    }

    case "add_text_layer": {
      if (params.text !== undefined && typeof params.text !== "string") {
        throw new ValidationError("Text layer content must be a string.", "text");
      }
      break;
    }

    case "set_layer_opacity": {
      if (params.opacity !== undefined) {
        const op = Number(params.opacity);
        if (isNaN(op) || op < 0 || op > 100) {
          throw new ValidationError("Opacity must be a number between 0 and 100.", "opacity");
        }
      }
      break;
    }

    case "set_layer_blending_mode": {
      if (typeof params.mode !== "string" || !params.mode.trim()) {
        throw new ValidationError("Blending mode must be a valid mode string.", "mode");
      }
      const match = ALLOWED_BLENDING_MODES.find(
        (m) => m.toLowerCase() === params.mode.trim().toLowerCase()
      );
      if (!match) {
        throw new ValidationError(
          `Invalid blending mode '${params.mode}'. Allowed modes include: Normal, Multiply, Screen, Overlay, Add, Soft Light, etc.`,
          "mode"
        );
      }
      params.mode = match;
      break;
    }

    case "import_media_to_project": {
      if (Array.isArray(params.filePaths)) {
        params.filePaths = params.filePaths.map((p, idx) =>
          validateWindowsPath(p, `filePaths[${idx}]`, { mustExist: true })
        );
      } else if (params.filePath) {
        params.filePath = validateWindowsPath(params.filePath, "filePath", { mustExist: true });
      } else {
        throw new ValidationError("import_media_to_project requires 'filePath' or 'filePaths'.", "filePath");
      }
      break;
    }

    case "save_project": {
      if (params.destinationPath) {
        params.destinationPath = validateWindowsPath(params.destinationPath, "destinationPath");
      }
      break;
    }

    case "remove_layer": {
      if (params.confirmRemoval !== true) {
        throw new ValidationError(
          "Layer removal is a destructive operation. You must set 'confirmRemoval: true' to proceed.",
          "confirmRemoval"
        );
      }
      break;
    }

    case "start_render_queue": {
      if (params.confirmRender !== true) {
        throw new ValidationError(
          "Starting the render queue can consume significant CPU/GPU resources. Set 'confirmRender: true' to start.",
          "confirmRender"
        );
      }
      break;
    }

    case "execute_extendscript": {
      if (typeof params.script !== "string" || !params.script.trim()) {
        throw new ValidationError("Parameter 'script' must be a non-empty string.", "script");
      }
      break;
    }
  }

  return {
    action: command.action,
    params: params
  };
}

module.exports = {
  ALLOWED_ACTIONS,
  ALLOWED_BLENDING_MODES,
  AE_2019_EXE,
  ValidationError,
  findAfterEffectsExe,
  validateWindowsPath,
  sanitizeObject,
  validateBridgeCommand
};
