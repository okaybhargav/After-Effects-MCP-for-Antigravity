"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  ALLOWED_ACTIONS,
  ALLOWED_BLENDING_MODES,
  ValidationError,
  validateWindowsPath,
  sanitizeObject,
  validateBridgeCommand
} = require("../mcp-server/validation");

test("validation.js — After Effects MCP parameter & security checks", async (t) => {
  await t.test("allows recognized actions and rejects unknown actions", () => {
    assert.equal(ALLOWED_ACTIONS.has("create_composition"), true);
    assert.equal(ALLOWED_ACTIONS.has("add_solid_layer"), true);
    assert.equal(ALLOWED_ACTIONS.has("set_layer_transform"), true);
    assert.equal(ALLOWED_ACTIONS.has("ae_ping"), true);

    assert.throws(
      () => validateBridgeCommand({ action: "malicious_system_exec" }),
      (err) => err instanceof ValidationError && err.message.includes("Unknown or unsupported action")
    );
  });

  await t.test("rejects prototype pollution keys in command parameters", () => {
    assert.throws(
      () =>
        validateBridgeCommand({
          action: "create_composition",
          params: JSON.parse('{"__proto__": {"polluted": true}}')
        }),
      (err) => err instanceof ValidationError && err.message.includes("Illegal property name")
    );

    assert.throws(
      () =>
        validateBridgeCommand({
          action: "create_composition",
          params: JSON.parse('{"constructor": {"polluted": true}}')
        }),
      (err) => err instanceof ValidationError && err.message.includes("Illegal property name")
    );
  });

  await t.test("validates Windows paths and blocks network UNC shares and relative paths", () => {
    assert.throws(
      () => validateWindowsPath("\\\\evil-nas\\share\\project.aep", "dest"),
      (err) => err instanceof ValidationError && err.message.includes("UNC paths are not supported")
    );

    assert.throws(
      () => validateWindowsPath("relative\\path\\to\\comp.aep", "dest"),
      (err) => err instanceof ValidationError && err.message.includes("must be an absolute Windows path")
    );

    const validWinPath = "C:\\Projects\\Comp.aep";
    const validated = validateWindowsPath(validWinPath, "dest");
    assert.equal(validated, path.normalize(validWinPath));
  });

  await t.test("validates composition dimensions, duration, and frame rates", () => {
    assert.throws(
      () =>
        validateBridgeCommand({
          action: "create_composition",
          params: { name: "Test", width: 999999 }
        }),
      (err) => err instanceof ValidationError && err.message.includes("Width must be an integer between 4 and 30000")
    );

    assert.throws(
      () =>
        validateBridgeCommand({
          action: "create_composition",
          params: { name: "Test", height: 1 }
        }),
      (err) => err instanceof ValidationError && err.message.includes("Height must be an integer between 4 and 30000")
    );

    assert.throws(
      () =>
        validateBridgeCommand({
          action: "create_composition",
          params: { name: "Test", duration: -5 }
        }),
      (err) => err instanceof ValidationError && err.message.includes("Duration must be a positive number")
    );

    const valid = validateBridgeCommand({
      action: "create_composition",
      params: { name: "Comp 1", width: 1920, height: 1080, duration: 10, frameRate: 30 }
    });
    assert.equal(valid.params.width, 1920);
    assert.equal(valid.params.height, 1080);
  });

  await t.test("validates solid layer color bounds (0.0 to 1.0)", () => {
    assert.throws(
      () =>
        validateBridgeCommand({
          action: "add_solid_layer",
          params: { color: [255, 0, 0] }
        }),
      (err) => err instanceof ValidationError && err.message.includes("between 0.0 and 1.0")
    );

    const validSolid = validateBridgeCommand({
      action: "add_solid_layer",
      params: { color: [1.0, 0.5, 0.0] }
    });
    assert.deepEqual(validSolid.params.color, [1.0, 0.5, 0.0]);
  });

  await t.test("validates blending modes against AE standard modes", () => {
    assert.throws(
      () =>
        validateBridgeCommand({
          action: "set_layer_blending_mode",
          params: { mode: "NonExistentMode" }
        }),
      (err) => err instanceof ValidationError && err.message.includes("Invalid blending mode")
    );

    const validMode = validateBridgeCommand({
      action: "set_layer_blending_mode",
      params: { mode: "multiply" }
    });
    assert.equal(validMode.params.mode, "Multiply");
  });

  await t.test("enforces confirmation flags for destructive operations", () => {
    assert.throws(
      () =>
        validateBridgeCommand({
          action: "remove_layer",
          params: { layerIndex: 1 }
        }),
      (err) => err instanceof ValidationError && err.message.includes("confirmRemoval")
    );

    assert.throws(
      () =>
        validateBridgeCommand({
          action: "start_render_queue",
          params: {}
        }),
      (err) => err instanceof ValidationError && err.message.includes("confirmRender")
    );
  });
});
