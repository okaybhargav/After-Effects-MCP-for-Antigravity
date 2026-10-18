"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateBridgeCommand,
  ValidationError,
  findAfterEffectsExe
} = require("./validation");

const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = Number(process.env.AE_BRIDGE_PORT) || 17892;
const DEFAULT_STATE_FILE =
  process.env.AE_BRIDGE_STATE_FILE || path.join(__dirname, "..", ".bridge-state.json");
const PANEL_HEARTBEAT_TTL_MS = 5000;
const MAX_HISTORY_ITEMS = 50;

class BridgeError extends Error {
  constructor(message, code = "BRIDGE_ERROR", details = null) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Local loopback HTTP bridge between the Node.js MCP server and the After Effects CEP panel.
 */
class AfterEffectsBridge {
  constructor(options = {}) {
    this.host = DEFAULT_BRIDGE_HOST;
    this.port = options.port !== undefined ? Number(options.port) : DEFAULT_BRIDGE_PORT;
    this.stateFilePath = options.stateFilePath || DEFAULT_STATE_FILE;
    this.panelHeartbeatTtlMs = options.panelHeartbeatTtlMs || PANEL_HEARTBEAT_TTL_MS;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 120000;
    this.allowClientProxy = options.allowClientProxy !== false;

    this.currentUser = this._getCurrentUsername();
    this.token = options.token || this._loadOrCreateToken();

    this.server = null;
    this.mode = "stopped"; // "primary" | "client" | "stopped"
    this.startedAt = null;

    // Queue and active commands
    this.queue = [];
    this.pending = new Map(); // id -> { cmd, resolve, reject, timer }
    this.history = [];

    // Connected CEP panel state
    this.lastPanelPollAt = 0;
    this.panelInfo = null;
  }

  _getCurrentUsername() {
    try {
      const userInfo = os.userInfo();
      return userInfo && userInfo.username ? userInfo.username : (process.env.USERNAME || "unknown");
    } catch (_err) {
      return process.env.USERNAME || "unknown";
    }
  }

  _loadOrCreateToken() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.token === "string" && parsed.token.length >= 32) {
          return parsed.token;
        }
      }
    } catch (_err) {
      // Create new token
    }
    return crypto.randomBytes(32).toString("hex");
  }

  _saveStateFile() {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        host: this.host,
        port: this.port,
        token: this.token,
        pid: process.pid,
        user: this.currentUser,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      // Log warning to stderr
      process.stderr.write(`[AfterEffectsMCP] Warning: Failed to persist bridge state file: ${err.message}\n`);
    }
  }

  isPanelConnected() {
    if (!this.lastPanelPollAt) return false;
    return Date.now() - this.lastPanelPollAt <= this.panelHeartbeatTtlMs;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.mode !== "stopped") {
        return resolve({ mode: this.mode, port: this.port });
      }

      const server = http.createServer((req, res) => {
        this._handleHttpRequest(req, res);
      });

      server.on("error", async (err) => {
        if (err.code === "EADDRINUSE" && this.allowClientProxy) {
          try {
            const reachable = await this._verifyExistingPrimaryBridge();
            if (reachable) {
              this.mode = "client";
              resolve({ mode: "client", port: this.port });
              return;
            }
          } catch (_e) {
            // Fall through to reject
          }
        }
        reject(err);
      });

      server.listen(this.port, this.host, () => {
        this.server = server;
        this.mode = "primary";
        this.startedAt = new Date().toISOString();
        this._saveStateFile();
        resolve({ mode: "primary", port: this.port });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new BridgeError("Bridge server stopped while command was executing.", "BRIDGE_STOPPED"));
        this.pending.delete(id);
      }
      this.queue = [];

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.mode = "stopped";
          resolve();
        });
      } else {
        this.mode = "stopped";
        resolve();
      }
    });
  }

  _verifyExistingPrimaryBridge() {
    return new Promise((resolve) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: "/api/panel/status",
        method: "GET",
        headers: {
          "X-AE-Bridge-Token": this.token
        },
        timeout: 2000
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  _checkAuthorization(req) {
    const authHeader =
      req.headers["x-ae-bridge-token"] ||
      req.headers["x-premiere-bridge-token"] ||
      "";
    if (authHeader && authHeader === this.token) {
      return true;
    }
    const authBearer = req.headers["authorization"] || "";
    if (authBearer.startsWith("Bearer ") && authBearer.slice(7).trim() === this.token) {
      return true;
    }
    return false;
  }

  _checkOrigin(req) {
    const origin = req.headers["origin"];
    if (!origin) return true;
    if (origin === "null" || origin.startsWith("file://") || origin.startsWith("chrome-extension://")) return true;
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
    return false;
  }

  _handleHttpRequest(req, res) {
    if (!this._checkOrigin(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Cross-origin request rejected." }));
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${this.host}:${this.port}`);
    const pathname = parsedUrl.pathname;

    if (!this._checkAuthorization(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Unauthorized. Missing or invalid X-AE-Bridge-Token." }));
      return;
    }

    if (pathname === "/api/poll" && req.method === "GET") {
      this._handlePoll(req, res);
      return;
    }

    if (pathname === "/api/result" && req.method === "POST") {
      this._handleResult(req, res);
      return;
    }

    if (pathname === "/api/panel/status" && req.method === "GET") {
      this._handlePanelStatus(req, res);
      return;
    }

    if (pathname === "/api/command" && req.method === "POST") {
      this._handleCommandPost(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: `Endpoint ${pathname} not found.` }));
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
        if (data.length > 5 * 1024 * 1024) {
          reject(new BridgeError("Request body exceeded 5MB limit", "PAYLOAD_TOO_LARGE"));
        }
      });
      req.on("end", () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new ValidationError(`Malformed JSON in request body: ${err.message}`));
        }
      });
      req.on("error", reject);
    });
  }

  _handlePoll(req, res) {
    this.lastPanelPollAt = Date.now();
    const versionHeader = req.headers["x-ae-version"] || "";
    if (versionHeader && (!this.panelInfo || this.panelInfo.aeVersion !== versionHeader)) {
      this.panelInfo = Object.assign({}, this.panelInfo, { aeVersion: versionHeader });
    }

    if (this.queue.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ empty: true }));
      return;
    }

    const command = this.queue.shift();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(command));
  }

  async _handleResult(req, res) {
    try {
      const payload = await this._readBody(req);
      const commandId = payload.commandId || payload.id;
      if (!commandId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Missing commandId in result payload." }));
        return;
      }

      const pending = this.pending.get(commandId);
      if (!pending) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, note: "Command had already completed or timed out." }));
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(commandId);

      const historyItem = {
        id: commandId,
        action: pending.cmd.action,
        params: pending.cmd.params,
        dispatchedAt: pending.dispatchedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startTime,
        ok: Boolean(payload.ok),
        result: payload.result !== undefined ? payload.result : null,
        error: payload.error || null
      };
      this._recordHistory(historyItem);

      if (payload.ok) {
        pending.resolve(payload.result);
      } else {
        pending.reject(
          new BridgeError(
            payload.error || "ExtendScript execution failed",
            payload.code || "EXTENDSCRIPT_ERROR",
            payload.details || null
          )
        );
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  _handlePanelStatus(req, res) {
    const isConn = this.isPanelConnected();
    const statusData = {
      ok: true,
      bridgeMode: this.mode,
      port: this.port,
      panelConnected: isConn,
      lastPanelPollAt: this.lastPanelPollAt ? new Date(this.lastPanelPollAt).toISOString() : null,
      pendingCommands: this.queue.length + this.pending.size,
      panelInfo: this.panelInfo,
      currentUser: this.currentUser
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(statusData));
  }

  async _handleCommandPost(req, res) {
    try {
      const payload = await this._readBody(req);
      const result = await this.execute(payload.action, payload.params, payload.timeoutMs);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const statusCode = err instanceof ValidationError ? 400 : 500;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message, code: err.code || "COMMAND_FAILED" }));
    }
  }

  _recordHistory(item) {
    this.history.unshift(item);
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history.length = MAX_HISTORY_ITEMS;
    }
  }

  async execute(action, params = {}, timeoutMs = null) {
    const validated = validateBridgeCommand({ action, params });
    const effectiveTimeout = Number(timeoutMs) || this.defaultTimeoutMs;

    if (this.mode === "client") {
      return this._executeViaClientProxy(validated.action, validated.params, effectiveTimeout);
    }

    if (action !== "ae_ping" && action !== "ae_health_check") {
      if (!this.isPanelConnected()) {
        throw new BridgeError(
          "After Effects CEP Panel is not connected. Open Adobe After Effects -> Window -> Extensions -> After Effects MCP Bridge, and ensure the panel is loaded.",
          "PANEL_NOT_CONNECTED",
          {
            lastPoll: this.lastPanelPollAt ? new Date(this.lastPanelPollAt).toISOString() : null,
            port: this.port
          }
        );
      }
    }

    const commandId = "cmd_" + crypto.randomBytes(8).toString("hex") + "_" + Date.now();
    const commandPayload = {
      id: commandId,
      action: validated.action,
      params: validated.params,
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(commandId)) {
          this.pending.delete(commandId);
          const err = new BridgeError(
            `Operation '${action}' timed out after ${effectiveTimeout}ms in After Effects ExtendScript bridge.`,
            "COMMAND_TIMEOUT",
            { commandId, action }
          );
          this._recordHistory({
            id: commandId,
            action,
            params: validated.params,
            completedAt: new Date().toISOString(),
            ok: false,
            error: err.message
          });
          reject(err);
        }
      }, effectiveTimeout);

      this.pending.set(commandId, {
        cmd: commandPayload,
        startTime: Date.now(),
        dispatchedAt: new Date().toISOString(),
        resolve,
        reject,
        timer
      });

      this.queue.push(commandPayload);
    });
  }

  _executeViaClientProxy(action, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ action, params, timeoutMs });
      const options = {
        hostname: this.host,
        port: this.port,
        path: "/api/command",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-AE-Bridge-Token": this.token
        },
        timeout: timeoutMs + 2000
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.ok) {
              resolve(parsed.result);
            } else {
              reject(new BridgeError(parsed.error, parsed.code || "REMOTE_BRIDGE_ERROR"));
            }
          } catch (err) {
            reject(new BridgeError(`Invalid response from primary bridge: ${err.message}`));
          }
        });
      });

      req.on("error", (err) => reject(new BridgeError(`Failed to reach primary bridge: ${err.message}`)));
      req.on("timeout", () => {
        req.destroy();
        reject(new BridgeError(`Client proxy timed out after ${timeoutMs}ms`));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = {
  AfterEffectsBridge,
  BridgeError,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT
};
