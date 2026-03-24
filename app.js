(function () {
  "use strict";

  var UI_EVENT_NAME = "tradeLotFeed:update";
  var UI_READY_EVENT_NAME = "tradeLotFeed:ready";

  var emptyState = document.getElementById("empty-state");
  var tableWrap = document.getElementById("table-wrap");
  var feedBody = document.getElementById("feed-body");
  var entryCount = document.getElementById("entry-count");
  var syncStatus = document.getElementById("sync-status");
  var lastUpdated = document.getElementById("last-updated");
  var feedSource = document.getElementById("feed-source");
  var argCount = document.getElementById("arg-count");
  var eventName = document.getElementById("event-name");
  var bridgeKind = document.getElementById("bridge-kind");
  var rawArgsBody = document.getElementById("raw-args-body");
  var chunkState = {
    meta: null,
    parts: []
  };

  var bridge = detectBridge();
  feedSource.textContent = "Source: " + bridge.label;
  bridgeKind.textContent = bridge.kind;
  bridge.bind(function (payload) {
    render(payload);
  });
  bridge.emitReady();
  registerFallbackBridge();

  function detectBridge() {
    if (window.alt && typeof window.alt.on === "function") {
      return {
        kind: "alt-webview",
        label: "alt WebView bridge",
        bind: function (handler) {
          window.alt.on(UI_EVENT_NAME, handler);
        },
        emitReady: function () {
          if (typeof window.alt.emit === "function") {
            window.alt.emit(UI_READY_EVENT_NAME);
          }
        }
      };
    }

    return {
      kind: "external",
      label: "external browser / mp execute",
      bind: function () {},
      emitReady: function () {}
    };
  }

  function formatValue(value) {
    return value === undefined || value === null || value === "" ? "-" : String(value);
  }

  function formatJson(value) {
    if (value === undefined || value === null || value === "") {
      return "-";
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  function createTextCell(value) {
    var cell = document.createElement("td");
    cell.textContent = formatValue(value);
    return cell;
  }

  function createCodeCell(value, className) {
    var cell = document.createElement("td");
    var code = document.createElement("code");
    code.className = className || "code-block";
    code.textContent = formatJson(value);
    cell.appendChild(code);
    return cell;
  }

  function renderLots(items) {
    feedBody.innerHTML = "";

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = document.createElement("tr");

      row.appendChild(createTextCell(item.index));
      row.appendChild(createTextCell(item.id));
      row.appendChild(createTextCell(item.itemId));
      row.appendChild(createTextCell(item.amount));
      row.appendChild(createTextCell(item.price));
      row.appendChild(createTextCell(item.accountId));
      row.appendChild(createTextCell(item.type));
      row.appendChild(createCodeCell(item.rawArgs, "code-block code-block--compact"));
      row.appendChild(createCodeCell(item.parsedArgs, "code-block code-block--compact"));

      var parseStateCell = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = item.parseError ? "type-badge type-badge--error" : "type-badge";
      badge.textContent = item.parseError ? "parse error: " + item.parseError : "ok";
      parseStateCell.appendChild(badge);
      row.appendChild(parseStateCell);

      feedBody.appendChild(row);
    }
  }

  function renderArgs(args) {
    rawArgsBody.innerHTML = "";

    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      var row = document.createElement("tr");

      row.appendChild(createTextCell(arg.index));
      row.appendChild(createTextCell(arg.type));
      row.appendChild(createTextCell(arg.length));
      row.appendChild(createCodeCell(arg.preview));

      rawArgsBody.appendChild(row);
    }
  }

  function render(payload) {
    var items = Array.isArray(payload && payload.lots) ? payload.lots : [];
    var args = Array.isArray(payload && payload.args) ? payload.args : [];

    eventName.textContent = payload && payload.eventName ? payload.eventName : UI_EVENT_NAME;
    argCount.textContent = String(args.length);
    lastUpdated.textContent = payload && payload.updatedAt ? payload.updatedAt : "-";

    renderArgs(args);

    if (items.length === 0) {
      emptyState.hidden = false;
      tableWrap.hidden = true;
      entryCount.textContent = "0 lots";
      syncStatus.textContent = "Waiting for payload";
      return;
    }

    emptyState.hidden = true;
    tableWrap.hidden = false;
    entryCount.textContent = items.length + " lots";
    syncStatus.textContent = "Payload received";
    renderLots(items);
  }

  function registerFallbackBridge() {
    window.addEventListener("message", function (event) {
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (event.data.type === UI_EVENT_NAME) {
        render(event.data.payload);
      }
    });

    window.addEventListener(UI_EVENT_NAME, function (event) {
      if (event.detail) {
        render(event.detail);
      }
    });
  }

  window.tradeLotFeedSync = function tradeLotFeedSync(payload) {
    render(payload);
  };

  window.tradeLotFeedBegin = function tradeLotFeedBegin(meta) {
    chunkState.meta = meta || {};
    chunkState.parts = [];
  };

  window.tradeLotFeedPushChunk = function tradeLotFeedPushChunk(chunk) {
    chunkState.parts.push(String(chunk || ""));
  };

  window.tradeLotFeedCommit = function tradeLotFeedCommit() {
    var serializedPayload = chunkState.parts.join("");
    var payload;

    try {
      payload = JSON.parse(serializedPayload);
    } catch (error) {
      payload = {
        eventName: chunkState.meta && chunkState.meta.eventName ? chunkState.meta.eventName : UI_EVENT_NAME,
        updatedAt: chunkState.meta && chunkState.meta.updatedAt ? chunkState.meta.updatedAt : null,
        args: [],
        lots: [{
          index: 0,
          id: null,
          itemId: null,
          amount: null,
          price: null,
          accountId: null,
          type: "payload-parse-error",
          rawArgs: serializedPayload,
          parsedArgs: null,
          parseError: error && error.message ? error.message : "Unknown payload parse error"
        }]
      };
    }

    render(payload);
  };

  render({ args: [], lots: [], updatedAt: null, eventName: UI_EVENT_NAME });
}());
