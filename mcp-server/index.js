#!/usr/bin/env node
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require("@modelcontextprotocol/sdk/types.js");

const { AfterEffectsBridge } = require("./bridge");
const { TOOL_DEFINITIONS, executeToolCall } = require("./tools");

const SERVER_NAME = "after-effects";
const SERVER_VERSION = "1.0.0";

/**
 * Creates and configures the After Effects MCP Server instance.
 */
function createMcpServer(options = {}) {
  const bridge = options.bridge || new AfterEffectsBridge(options.bridgeOptions || {});

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_DEFINITIONS
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    try {
      const result = await executeToolCall(bridge, toolName, args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: false
      };
    } catch (err) {
      const errorPayload = {
        ok: false,
        tool: toolName,
        error: err.message || "Unknown error executing After Effects tool.",
        code: err.code || "TOOL_EXECUTION_ERROR",
        details: err.details || null
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(errorPayload, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  return { server, bridge };
}

async function main() {
  const { server, bridge } = createMcpServer();

  try {
    const bridgeStatus = await bridge.start();
    process.stderr.write(
      `[AfterEffectsMCP] HTTP Bridge started (${bridgeStatus.mode}) on http://${bridge.host}:${bridgeStatus.port}\n`
    );
  } catch (err) {
    process.stderr.write(`[AfterEffectsMCP] Warning starting HTTP Bridge: ${err.message}\n`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[AfterEffectsMCP] MCP stdio server v${SERVER_VERSION} connected and ready.\n`);

  const shutdown = async () => {
    try {
      await bridge.stop();
    } catch (_) {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[AfterEffectsMCP] Fatal startup error: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  createMcpServer,
  SERVER_NAME,
  SERVER_VERSION
};
