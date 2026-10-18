/* global window, document, XMLHttpRequest, Buffer */
(function () {
  "use strict";

  var DEFAULT_STATE_FILE = "C:/MCP/After Effect MCP/.bridge-state.json";
  var CANDIDATE_STATE_FILES = [
    "C:/MCP/After Effect MCP/.bridge-state.json"
  ];
  var DEFAULT_PORT = 17892;
  var POLL_INTERVAL_CONNECTED_MS = 800;
  var HOST_REFRESH_INTERVAL_MS = 8000;
  var MAX_LOG_ENTRIES = 50;

  var state = {
    bridgeHost: "127.0.0.1",
    bridgePort: DEFAULT_PORT,
    bridgeToken: "",
    stateFilePath: DEFAULT_STATE_FILE,
    connected: false,
    pollingInFlight: false,
    executingCommand: false,
    lastHeartbeat: null,
    hostStatus: {
      hostVersion: "",
      projectOpen: false,
      projectName: "",
      projectPath: "",
      activeComp: ""
    },
    lastHostRefreshMs: 0
  };

  var hostLoaded = false;
  var hostLoading = false;

  // DOM Elements
  var elBadge = document.getElementById("connection-badge");
  var elEndpoint = document.getElementById("val-endpoint");
  var elTokenStatus = document.getElementById("val-token-status");
  var elAppVersion = document.getElementById("val-app-version");
  var elProjectName = document.getElementById("val-project-name");
  var elCompName = document.getElementById("val-comp-name");
  var elHeartbeat = document.getElementById("val-heartbeat");
  var elQueueState = document.getElementById("val-queue-state");
  var elActiveCommandBox = document.getElementById("active-command-box");
  var elOperationLog = document.getElementById("operation-log");
  var elInputStatePath = document.getElementById("input-state-path");
  var elInputPort = document.getElementById("input-port");
  var elInputToken = document.getElementById("input-token");

  function getHttpModule() {
    try {
      if (typeof window.require === "function") {
        return window.require("http");
      }
      if (window.cep_node && typeof window.cep_node.require === "function") {
        return window.cep_node.require("http");
      }
    } catch (_e) {}
    return null;
  }

  function evalExtendScript(script, callback) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
      try {
        window.__adobe_cep__.evalScript(script, function (result) {
          callback(null, result);
        });
      } catch (e) {
        callback(e);
      }
    } else {
      callback(new Error("CEP runtime (window.__adobe_cep__) is not available."));
    }
  }

  function escapeForExtendScriptLiteral(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }

  function debugLog(msg) {
    try {
      var nodeRequire = (window.cep_node && window.cep_node.require) || window.require;
      if (typeof nodeRequire === "function") {
        var fs = nodeRequire("fs");
        fs.appendFileSync("C:/MCP/After Effect MCP/panel_debug.txt", new Date().toISOString() + " " + msg + "\n");
      }
    } catch (_e) {}
  }

  function ensureHostLoaded(callback) {
    if (hostLoaded) {
      return callback(null, true);
    }
    if (hostLoading) {
      setTimeout(function () { ensureHostLoaded(callback); }, 150);
      return;
    }

    hostLoading = true;
    debugLog("ensureHostLoaded checking typeof $._AfterEffectsMCP_");
    evalExtendScript("typeof $._AfterEffectsMCP_", function (err, res) {
      debugLog("typeof res: " + res + " err: " + err);
      if (!err && res === "object") {
        hostLoaded = true;
        hostLoading = false;
        return callback(null, true);
      }

      try {
        var extPath = "";
        if (window.__adobe_cep__ && typeof window.__adobe_cep__.getSystemPath === "function") {
          extPath = window.__adobe_cep__.getSystemPath("extension");
        }
        debugLog("extPath: " + extPath);
        if (extPath) {
          var normalized = extPath.replace(/\\/g, "/") + "/host/aftereffects.jsx";
          var loadScript = "try { $.evalFile(new File('" + escapeForExtendScriptLiteral(normalized) + "')); typeof $._AfterEffectsMCP_; } catch(e) { 'EVAL_ERR:' + e.toString() + ' line:' + e.line; }";
          debugLog("executing loadScript: " + normalized);
          evalExtendScript(loadScript, function (err2, res2) {
            hostLoading = false;
            debugLog("loadScript result: " + res2 + " err: " + err2);
            if (err2 || res2 !== "object") {
              callback(new Error("Failed to load host/aftereffects.jsx: " + (err2 || res2)));
            } else {
              hostLoaded = true;
              callback(null, true);
            }
          });
          return;
        }
      } catch (e) {
        hostLoading = false;
        debugLog("ensureHostLoaded exception: " + e.toString());
        return callback(e);
      }
      hostLoading = false;
      callback(new Error("window.__adobe_cep__ not available."));
    });
  }

  function loadBridgeState(callback) {
    var manualToken = elInputToken && elInputToken.value ? elInputToken.value.trim() : "";
    var manualPort = elInputPort && elInputPort.value ? parseInt(elInputPort.value, 10) : DEFAULT_PORT;
    if (manualPort >= 1024 && manualPort <= 65535) {
      state.bridgePort = manualPort;
    }
    if (elInputStatePath && elInputStatePath.value.trim()) {
      state.stateFilePath = elInputStatePath.value.trim();
    }

    if (manualToken.length >= 16) {
      state.bridgeToken = manualToken;
      updateStatusUI();
      if (callback) callback(null, true);
      return;
    }

    var candidateFiles = [];
    if (state.stateFilePath) candidateFiles.push(state.stateFilePath);
    for (var fi = 0; fi < CANDIDATE_STATE_FILES.length; fi++) {
      if (candidateFiles.indexOf(CANDIDATE_STATE_FILES[fi]) === -1) {
        candidateFiles.push(CANDIDATE_STATE_FILES[fi]);
      }
    }

    // Method 1: Node.js fs
    try {
      var nodeRequire = (window.cep_node && window.cep_node.require) || window.require;
      if (typeof nodeRequire === "function") {
        var fs = nodeRequire("fs");
        for (var i = 0; i < candidateFiles.length; i++) {
          var testPath = candidateFiles[i];
          if (fs.existsSync(testPath)) {
            var raw = fs.readFileSync(testPath, "utf8");
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed.token === "string" && parsed.token.length >= 16) {
              state.stateFilePath = testPath;
              state.bridgeToken = parsed.token;
              if (parsed.port) state.bridgePort = Number(parsed.port) || state.bridgePort;
              if (elInputStatePath) elInputStatePath.value = testPath;
              updateStatusUI();
              if (callback) callback(null, true);
              return;
            }
          }
        }
      }
    } catch (_nodeErr) {}

    // Method 2: ExtendScript File reader
    ensureHostLoaded(function (hostErr) {
      if (hostErr) {
        updateStatusUI();
        if (callback) callback(hostErr);
        return;
      }
      var targetFile = candidateFiles[0];
      var script = "$._AfterEffectsMCP_.readBridgeState('" + escapeForExtendScriptLiteral(targetFile) + "')";
      evalExtendScript(script, function (err, rawResult) {
        if (!err && rawResult) {
          try {
            var resp = JSON.parse(rawResult);
            var st = (resp && (resp.state || resp.result)) || null;
            if (resp && resp.ok && st && typeof st.token === "string" && st.token.length >= 16) {
              state.stateFilePath = targetFile;
              state.bridgeToken = st.token;
              if (st.port) state.bridgePort = Number(st.port) || state.bridgePort;
              if (elInputStatePath) elInputStatePath.value = targetFile;
              updateStatusUI();
              if (callback) callback(null, true);
              return;
            }
          } catch (_ignore) {}
        }
        updateStatusUI();
        if (callback) callback(new Error("Token not found yet"));
      });
    });
  }

  function queryHostStatus(callback) {
    ensureHostLoaded(function (err) {
      if (err) return callback && callback(err);
      evalExtendScript("$._AfterEffectsMCP_.getHostStatus()", function (evalErr, raw) {
        if (evalErr) return callback && callback(evalErr);
        try {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.ok) {
            var res = parsed.result || parsed.status || {};
            state.hostStatus = {
              hostVersion: res.hostVersion || "",
              projectOpen: Boolean(res.projectOpen),
              projectName: res.projectName ? decodeURIComponent(res.projectName) : "",
              projectPath: res.projectPath || "",
              activeComp: res.activeComp || ""
            };
            state.lastHostRefreshMs = Date.now();
            updateStatusUI();
            if (callback) callback(null, state.hostStatus);
          } else {
            if (callback) callback(new Error((parsed && parsed.error) || "Host status query failed"));
          }
        } catch (parseErr) {
          if (callback) callback(parseErr);
        }
      });
    });
  }

  function updateStatusUI() {
    var hs = state.hostStatus || {};
    if (elEndpoint && elEndpoint.textContent !== (state.bridgeHost + ":" + state.bridgePort)) {
      elEndpoint.textContent = state.bridgeHost + ":" + state.bridgePort;
    }
    if (elTokenStatus) {
      if (state.bridgeToken && state.bridgeToken.length >= 16) {
        var masked = "Loaded (" + state.bridgeToken.slice(0, 6) + "...)";
        if (elTokenStatus.textContent !== masked) {
          elTokenStatus.textContent = masked;
          elTokenStatus.style.color = "var(--status-connected)";
        }
      } else {
        if (elTokenStatus.textContent !== "Missing Token") {
          elTokenStatus.textContent = "Missing Token";
          elTokenStatus.style.color = "var(--status-disconnected)";
        }
      }
    }
    if (elAppVersion) {
      var v = hs.hostVersion || "—";
      if (elAppVersion.textContent !== v) elAppVersion.textContent = v;
    }
    if (elProjectName) {
      var pName = hs.projectOpen ? (hs.projectName || "Untitled") : "No project loaded";
      if (elProjectName.textContent !== pName) elProjectName.textContent = pName;
    }
    if (elCompName) {
      var cName = hs.activeComp || "None";
      if (elCompName.textContent !== cName) elCompName.textContent = cName;
    }
    if (elBadge) {
      if (state.connected) {
        if (elBadge.textContent !== "Connected") {
          elBadge.textContent = "Connected";
          elBadge.className = "badge badge-connected";
        }
      } else {
        if (elBadge.textContent !== "Disconnected") {
          elBadge.textContent = "Disconnected";
          elBadge.className = "badge badge-disconnected";
        }
      }
    }
    if (elHeartbeat) {
      if (state.lastHeartbeat) {
        var secAgo = Math.round((Date.now() - state.lastHeartbeat) / 1000);
        elHeartbeat.textContent = secAgo + "s ago";
      } else {
        if (elHeartbeat.textContent !== "Never") elHeartbeat.textContent = "Never";
      }
    }
    if (elQueueState) {
      if (state.executingCommand) {
        if (elQueueState.textContent !== "Executing") {
          elQueueState.textContent = "Executing";
          elQueueState.className = "queue-pill busy";
        }
      } else {
        if (elQueueState.textContent !== "Idle") {
          elQueueState.textContent = "Idle";
          elQueueState.className = "queue-pill";
        }
      }
    }
  }

  function logOperation(item) {
    if (!elOperationLog) return;
    var emptyEl = elOperationLog.querySelector(".log-empty");
    if (emptyEl) {
      elOperationLog.removeChild(emptyEl);
    }

    var row = document.createElement("div");
    row.className = "log-entry";

    var meta = document.createElement("div");
    meta.className = "log-meta";
    meta.innerHTML =
      "<span>" + new Date().toLocaleTimeString() + " — <strong>" + (item.action || "unknown") + "</strong></span>" +
      "<span class='" + (item.ok ? "log-ok" : "log-error") + "'>" + (item.ok ? "OK" : "FAILED") + "</span>";

    var detail = document.createElement("div");
    detail.className = "log-detail";
    if (item.ok) {
      detail.textContent = item.result ? JSON.stringify(item.result).slice(0, 140) : "Success";
    } else {
      detail.textContent = item.error || "Error";
      detail.style.color = "var(--status-disconnected)";
    }

    row.appendChild(meta);
    row.appendChild(detail);
    elOperationLog.insertBefore(row, elOperationLog.firstChild);

    while (elOperationLog.children.length > MAX_LOG_ENTRIES) {
      elOperationLog.removeChild(elOperationLog.lastChild);
    }
  }

  function sendCommandResult(commandId, ok, result, error, code, details) {
    var payloadString = JSON.stringify({
      commandId: commandId,
      ok: Boolean(ok),
      result: result !== undefined ? result : null,
      error: error || null,
      code: code || (ok ? null : "EXTENDSCRIPT_ERROR"),
      details: details || null
    });

    var nodeHttp = getHttpModule();
    if (nodeHttp) {
      try {
        var req = nodeHttp.request(
          {
            hostname: state.bridgeHost,
            port: state.bridgePort,
            path: "/api/result",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-AE-Bridge-Token": state.bridgeToken
            },
            timeout: 5000
          },
          function () {}
        );
        req.on("error", function () {});
        req.write(payloadString);
        req.end();
        return;
      } catch (_e) {}
    }

    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "http://" + state.bridgeHost + ":" + state.bridgePort + "/api/result", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-AE-Bridge-Token", state.bridgeToken);
      xhr.timeout = 5000;
      xhr.send(payloadString);
    } catch (_xhrErr) {}
  }

  function executeCommand(cmd) {
    state.executingCommand = true;
    updateStatusUI();

    if (elActiveCommandBox) {
      elActiveCommandBox.className = "command-box";
      elActiveCommandBox.textContent = cmd.action + " (" + cmd.id + ")\n" + JSON.stringify(cmd.params || {}, null, 2);
    }

    ensureHostLoaded(function (err) {
      if (err) {
        state.executingCommand = false;
        updateStatusUI();
        sendCommandResult(cmd.id, false, null, err.message, "HOST_NOT_READY");
        logOperation({ action: cmd.action, ok: false, error: err.message });
        return;
      }

      var cmdString = escapeForExtendScriptLiteral(JSON.stringify(cmd));
      var script = "$._AfterEffectsMCP_.dispatch('" + cmdString + "')";

      evalExtendScript(script, function (evalErr, rawResult) {
        state.executingCommand = false;
        if (elActiveCommandBox) {
          elActiveCommandBox.className = "command-box empty";
          elActiveCommandBox.textContent = "No command currently executing.";
        }
        updateStatusUI();

        if (evalErr) {
          sendCommandResult(cmd.id, false, null, evalErr.message, "EVAL_SCRIPT_ERROR");
          logOperation({ action: cmd.action, ok: false, error: evalErr.message });
          return;
        }

        try {
          var parsed = JSON.parse(rawResult);
          if (parsed && parsed.ok) {
            sendCommandResult(cmd.id, true, parsed.result, null, null, null);
            logOperation({ action: cmd.action, ok: true, result: parsed.result });
          } else {
            var msg = (parsed && parsed.error) || "ExtendScript returned failure.";
            var cde = (parsed && parsed.code) || "EXTENDSCRIPT_ERROR";
            var dtl = (parsed && parsed.details) || null;
            sendCommandResult(cmd.id, false, null, msg, cde, dtl);
            logOperation({ action: cmd.action, ok: false, error: msg });
          }
        } catch (parseErr) {
          sendCommandResult(cmd.id, false, null, "Failed to parse ExtendScript response: " + parseErr.message, "JSON_PARSE_ERROR");
          logOperation({ action: cmd.action, ok: false, error: parseErr.message });
        }
      });
    });
  }

  function pollBridge() {
    if (state.pollingInFlight || state.executingCommand) return;
    if (!state.bridgeToken) {
      loadBridgeState();
      return;
    }

    state.pollingInFlight = true;
    var nodeHttp = getHttpModule();

    if (nodeHttp) {
      try {
        var req = nodeHttp.request(
          {
            hostname: state.bridgeHost,
            port: state.bridgePort,
            path: "/api/poll",
            method: "GET",
            headers: {
              "X-AE-Bridge-Token": state.bridgeToken,
              "X-AE-Version": (state.hostStatus && state.hostStatus.hostVersion) || ""
            },
            timeout: 2500
          },
          function (res) {
            var body = "";
            res.on("data", function (chunk) { body += chunk; });
            res.on("end", function () {
              state.pollingInFlight = false;
              if (res.statusCode === 200 || res.statusCode === 204) {
                state.connected = true;
                state.lastHeartbeat = Date.now();
                updateStatusUI();

                if (res.statusCode === 200 && body) {
                  try {
                    var data = JSON.parse(body);
                    if (data && !data.empty && data.id && data.action) {
                      executeCommand(data);
                    }
                  } catch (_parseErr) {}
                }
              } else {
                state.connected = false;
                updateStatusUI();
              }
            });
          }
        );

        req.on("error", function () {
          state.pollingInFlight = false;
          state.connected = false;
          updateStatusUI();
        });

        req.on("timeout", function () {
          req.destroy();
          state.pollingInFlight = false;
          state.connected = false;
          updateStatusUI();
        });

        req.end();
        return;
      } catch (_httpErr) {
        // Fall back to XMLHttpRequest
      }
    }

    // Fallback: XMLHttpRequest
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "http://" + state.bridgeHost + ":" + state.bridgePort + "/api/poll", true);
      xhr.setRequestHeader("X-AE-Bridge-Token", state.bridgeToken);
      xhr.timeout = 2500;

      xhr.onload = function () {
        state.pollingInFlight = false;
        if (xhr.status === 200 || xhr.status === 204) {
          state.connected = true;
          state.lastHeartbeat = Date.now();
          updateStatusUI();

          if (xhr.status === 200 && xhr.responseText) {
            try {
              var data = JSON.parse(xhr.responseText);
              if (data && !data.empty && data.id && data.action) {
                executeCommand(data);
              }
            } catch (_parseErr) {}
          }
        } else {
          state.connected = false;
          updateStatusUI();
        }
      };

      xhr.onerror = function () {
        state.pollingInFlight = false;
        state.connected = false;
        updateStatusUI();
      };

      xhr.ontimeout = function () {
        state.pollingInFlight = false;
        state.connected = false;
        updateStatusUI();
      };

      xhr.send();
    } catch (_e) {
      state.pollingInFlight = false;
      state.connected = false;
      updateStatusUI();
    }
  }

  function init() {
    loadBridgeState(function () {
      queryHostStatus();
    });

    var btnReconnect = document.getElementById("btn-reconnect");
    if (btnReconnect) {
      btnReconnect.addEventListener("click", function () {
        loadBridgeState(function () {
          queryHostStatus();
          pollBridge();
        });
      });
    }

    var btnRefreshHost = document.getElementById("btn-refresh-host");
    if (btnRefreshHost) {
      btnRefreshHost.addEventListener("click", function () {
        queryHostStatus(function (_err, st) {
          if (st) alert("Host connected: " + (st.projectName || "No Project") + " (Comp: " + (st.activeComp || "None") + ")");
        });
      });
    }

    var btnClearLog = document.getElementById("btn-clear-log");
    if (btnClearLog) {
      btnClearLog.addEventListener("click", function () {
        if (elOperationLog) elOperationLog.innerHTML = "<div class='log-empty'>Log cleared.</div>";
      });
    }

    var btnApplyConfig = document.getElementById("btn-apply-config");
    if (btnApplyConfig) {
      btnApplyConfig.addEventListener("click", function () {
        loadBridgeState(function () {
          pollBridge();
        });
      });
    }

    setInterval(function () {
      pollBridge();
    }, POLL_INTERVAL_CONNECTED_MS);

    setInterval(function () {
      if (Date.now() - state.lastHostRefreshMs > HOST_REFRESH_INTERVAL_MS && !state.executingCommand) {
        queryHostStatus();
      }
    }, HOST_REFRESH_INTERVAL_MS);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
