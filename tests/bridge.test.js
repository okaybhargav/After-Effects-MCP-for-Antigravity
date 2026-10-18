"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const { AfterEffectsBridge, BridgeError } = require("../mcp-server/bridge");
const { TOOL_DEFINITIONS, executeToolCall } = require("../mcp-server/tools");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test("bridge.js & tools.js — After Effects MCP loopback bridge and security", async (t) => {
  await t.test("registers all 32 After Effects MCP tools with valid schemas", () => {
    assert.equal(TOOL_DEFINITIONS.length, 32);
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(tool.name, "Tool must have a name");
      assert.ok(tool.description, `Tool ${tool.name} must have a description`);
      assert.equal(tool.inputSchema.type, "object", `Tool ${tool.name} schema must be object`);
    }
  });

  const tmpState = () => path.join(require("os").tmpdir(), "ae-test-" + Math.random().toString(36).slice(2) + ".json");

  await t.test("rejects unauthenticated requests and non-local origins", async () => {
    const bridge = new AfterEffectsBridge({ port: 17894, stateFilePath: tmpState() });
    await bridge.start();

    try {
      // 1. Missing token
      const noAuthRes = await httpRequest({
        hostname: "127.0.0.1",
        port: 17894,
        path: "/api/poll",
        method: "GET"
      });
      assert.equal(noAuthRes.statusCode, 401);

      // 2. Foreign Origin
      const evilOriginRes = await httpRequest({
        hostname: "127.0.0.1",
        port: 17894,
        path: "/api/poll",
        method: "GET",
        headers: {
          "Origin": "http://evil-website.com",
          "X-AE-Bridge-Token": bridge.token
        }
      });
      assert.equal(evilOriginRes.statusCode, 403);
    } finally {
      await bridge.stop();
    }
  });

  await t.test("fails fast with PANEL_NOT_CONNECTED when CEP panel has not polled", async () => {
    const bridge = new AfterEffectsBridge({ port: 17895, stateFilePath: tmpState() });
    await bridge.start();

    try {
      await assert.rejects(
        () => bridge.execute("get_project_info", {}),
        (err) => err instanceof BridgeError && err.code === "PANEL_NOT_CONNECTED"
      );
    } finally {
      await bridge.stop();
    }
  });

  await t.test("completes full poll -> dispatch -> result cycle and supports client proxy", async () => {
    const bridge = new AfterEffectsBridge({ port: 17896, stateFilePath: tmpState() });
    await bridge.start();

    try {
      // 1. Panel initial poll to register presence
      const initPoll = await httpRequest({
        hostname: "127.0.0.1",
        port: 17896,
        path: "/api/poll",
        method: "GET",
        headers: {
          "X-AE-Bridge-Token": bridge.token,
          "X-AE-Version": "16.1.2.55"
        }
      });
      assert.equal(initPoll.statusCode, 200);
      assert.equal(bridge.isPanelConnected(), true);

      // 2. Dispatch command asynchronously
      const execPromise = bridge.execute("create_composition", {
        name: "Test Comp",
        width: 1920,
        height: 1080
      });

      // 3. Panel polls and retrieves command
      const pollRes = await httpRequest({
        hostname: "127.0.0.1",
        port: 17896,
        path: "/api/poll",
        method: "GET",
        headers: { "X-AE-Bridge-Token": bridge.token }
      });
      assert.equal(pollRes.statusCode, 200);
      const receivedCmd = JSON.parse(pollRes.body);
      assert.equal(receivedCmd.action, "create_composition");
      assert.equal(receivedCmd.params.name, "Test Comp");

      // 4. Panel posts result back
      const postRes = await httpRequest(
        {
          hostname: "127.0.0.1",
          port: 17896,
          path: "/api/result",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AE-Bridge-Token": bridge.token
          }
        },
        {
          commandId: receivedCmd.id,
          ok: true,
          result: { id: 1, name: "Test Comp", width: 1920, height: 1080 }
        }
      );
      assert.equal(postRes.statusCode, 200);

      // 5. execPromise resolves with ExtendScript result
      const result = await execPromise;
      assert.equal(result.id, 1);
      assert.equal(result.name, "Test Comp");
    } finally {
      await bridge.stop();
    }
  });

  await t.test("starts MCP stdio server, completes initialize handshake, lists 32 tools, and runs ae_health_check", async () => {
    const serverPath = path.join(__dirname, "..", "mcp-server", "index.js");
    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: Object.assign({}, process.env, {
        AE_BRIDGE_PORT: "17897",
        AE_BRIDGE_STATE_FILE: tmpState()
      })
    });

    const client = new Client(
      { name: "test-ae-mcp-client", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
      const toolsResult = await client.listTools();
      assert.equal(toolsResult.tools.length, 32);

      const healthCall = await client.callTool({
        name: "ae_health_check",
        arguments: {}
      });
      assert.equal(healthCall.isError, false);
      const parsedHealth = JSON.parse(healthCall.content[0].text);
      assert.equal(parsedHealth.ok, true);
      assert.equal(parsedHealth.service, "After Effects MCP Bridge");
    } finally {
      await client.close();
    }
  });
});
