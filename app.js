(function () {
  "use strict";

  var UI_EVENT_NAME = "tradeLotFeed:update";
  var UI_READY_EVENT_NAME = "tradeLotFeed:ready";
  var STORAGE_KEY = "tradeLotFeed:lastPayload";
  var DEFAULT_IMPORT_STATUS = "Direct URL stays empty until a bridge or a share payload is provided.";

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
  var shareInput = document.getElementById("share-input");
  var loadShareButton = document.getElementById("load-share");
  var clearShareButton = document.getElementById("clear-share");
  var importStatus = document.getElementById("import-status");
  var chunkState = {
    meta: null,
    parts: []
  };

  var bridge = detectBridge();
  setSourceMeta(bridge.label, bridge.kind);
  setImportStatus(DEFAULT_IMPORT_STATUS, false);
  bridge.bind(function (payload) {
    applyPayload(payload, {
      sourceLabel: bridge.label,
      bridgeLabel: bridge.kind
    });
  });
  bridge.emitReady();
  registerFallbackBridge();
  registerManualImport();

  if (!renderSharedPayloadFromLocation()) {
    renderStoredPayload();
  }

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

  function setSourceMeta(sourceLabel, bridgeLabel) {
    if (sourceLabel) {
      feedSource.textContent = "Source: " + sourceLabel;
    }

    if (bridgeLabel) {
      bridgeKind.textContent = bridgeLabel;
    }
  }

  function setImportStatus(text, isError) {
    if (!importStatus) {
      return;
    }

    importStatus.textContent = text || DEFAULT_IMPORT_STATUS;
    importStatus.classList.toggle("import-status--error", !!isError);
    importStatus.classList.toggle("import-status--success", !!text && !isError && text !== DEFAULT_IMPORT_STATUS);
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
      syncStatus.textContent = args.length > 0 ? "Payload received without lots" : "Waiting for bridge or shared payload";
      return;
    }

    emptyState.hidden = true;
    tableWrap.hidden = false;
    entryCount.textContent = items.length + " lots";
    syncStatus.textContent = "Payload received";
    renderLots(items);
  }

  function encodeBase64Url(value) {
    var normalized = String(value || "");
    var index;

    for (index = 0; index < normalized.length; index++) {
      if (normalized.charCodeAt(index) > 255) {
        normalized = unescape(encodeURIComponent(normalized));
        break;
      }
    }

    return window.btoa(normalized).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodeBase64Url(value) {
    var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");

    while (normalized.length % 4 !== 0) {
      normalized += "=";
    }

    try {
      return decodeURIComponent(escape(window.atob(normalized)));
    } catch (error) {
      return null;
    }
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function buildPayloadHash(payload) {
    try {
      return "payload=" + encodeBase64Url(JSON.stringify(payload));
    } catch (error) {
      return "";
    }
  }

  function parseJsonPayload(value, source) {
    try {
      var payload = JSON.parse(value);
      return {
        ok: true,
        payload: payload,
        source: source,
        hash: buildPayloadHash(payload)
      };
    } catch (error) {
      return {
        ok: false,
        payload: null,
        source: source,
        hash: "",
        error: error && error.message ? error.message : "Unknown JSON parse error"
      };
    }
  }

  function parseEncodedPayload(value, source) {
    var encoded = safeDecodeURIComponent(String(value || "").trim());
    var decoded = decodeBase64Url(encoded);

    if (!decoded) {
      return {
        ok: false,
        payload: null,
        source: source,
        hash: "",
        error: "Could not decode the payload fragment."
      };
    }

    var result = parseJsonPayload(decoded, source);
    if (result.ok) {
      result.hash = "payload=" + encoded;
    }

    return result;
  }

  function parsePayloadText(value) {
    var text = String(value || "").trim();
    var payloadMatch;

    if (!text) {
      return {
        ok: false,
        payload: null,
        source: "",
        hash: "",
        error: "Paste a share link, a payload fragment, a base64url payload, or raw JSON."
      };
    }

    payloadMatch = text.match(/(?:#|[?&])payload=([^&]+)/);
    if (payloadMatch && payloadMatch[1]) {
      return parseEncodedPayload(payloadMatch[1], "shared-link");
    }

    if (/^#?payload=/.test(text)) {
      return parseEncodedPayload(text.replace(/^#?payload=/, ""), "payload-fragment");
    }

    if (text.charAt(0) === "{" || text.charAt(0) === "[") {
      return parseJsonPayload(text, "json");
    }

    if (/^[A-Za-z0-9\-_]+$/.test(text)) {
      return parseEncodedPayload(text, "base64url");
    }

    return {
      ok: false,
      payload: null,
      source: "",
      hash: "",
      error: "Could not detect a supported payload format in the provided text."
    };
  }

  function persistPayload(payload, meta) {
    if (!payload || typeof payload !== "object" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        sourceLabel: meta && meta.sourceLabel ? meta.sourceLabel : "",
        bridgeLabel: meta && meta.bridgeLabel ? meta.bridgeLabel : "",
        payload: payload
      }));
    } catch (error) {}
  }

  function readStoredPayload() {
    if (!window.localStorage) {
      return null;
    }

    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function syncLocationHash(hash) {
    if (!hash || !window.history || typeof window.history.replaceState !== "function") {
      return;
    }

    window.history.replaceState(null, "", window.location.pathname + window.location.search + "#" + hash);
  }

  function applyPayload(payload, meta) {
    var sourceLabel = meta && meta.sourceLabel ? meta.sourceLabel : null;
    var bridgeLabel = meta && meta.bridgeLabel ? meta.bridgeLabel : null;

    setSourceMeta(sourceLabel, bridgeLabel);
    render(payload);
    persistPayload(payload, meta || {});
  }

  function renderSharedPayloadFromLocation() {
    var hasSharedPayload = window.location.hash.indexOf("payload=") !== -1 || window.location.search.indexOf("payload=") !== -1;
    var result;

    if (!hasSharedPayload) {
      return false;
    }

    result = parsePayloadText(window.location.href);
    if (!result.ok) {
      setImportStatus("Share link detected but could not be decoded: " + result.error, true);
      return false;
    }

    applyPayload(result.payload, {
      sourceLabel: "shared payload link",
      bridgeLabel: "shared-link"
    });

    if (shareInput) {
      shareInput.value = window.location.href;
    }

    setImportStatus("Payload loaded from the share link in the address bar.", false);
    return true;
  }

  function renderStoredPayload() {
    var storedPayload = readStoredPayload();

    if (window.parent && window.parent !== window) {
      return false;
    }

    if (!storedPayload || !storedPayload.payload) {
      return false;
    }

    applyPayload(storedPayload.payload, {
      sourceLabel: storedPayload.sourceLabel || "browser cache",
      bridgeLabel: storedPayload.bridgeLabel || "cached"
    });

    setImportStatus("Loaded the last payload saved in this browser profile.", false);
    return true;
  }

  function registerFallbackBridge() {
    window.addEventListener("message", function (event) {
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (event.data.type === UI_EVENT_NAME || event.data.type === "tradeLotFeed:sync") {
        applyPayload(event.data.payload, {
          sourceLabel: "postMessage bridge",
          bridgeLabel: "postMessage"
        });
      }
    });

    window.addEventListener(UI_EVENT_NAME, function (event) {
      if (event.detail) {
        applyPayload(event.detail, {
          sourceLabel: "CustomEvent bridge",
          bridgeLabel: "custom-event"
        });
      }
    });
  }

  function registerManualImport() {
    if (!shareInput || !loadShareButton || !clearShareButton) {
      return;
    }

    loadShareButton.addEventListener("click", function () {
      var result = parsePayloadText(shareInput.value);

      if (!result.ok) {
        setImportStatus(result.error, true);
        return;
      }

      applyPayload(result.payload, {
        sourceLabel: "manual import (" + result.source + ")",
        bridgeLabel: "manual-import"
      });
      syncLocationHash(result.hash);
      setImportStatus("Payload loaded from " + result.source + ".", false);
    });

    clearShareButton.addEventListener("click", function () {
      shareInput.value = "";
      setImportStatus(DEFAULT_IMPORT_STATUS, false);

      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    });
  }

  window.tradeLotFeedSync = function tradeLotFeedSync(payload) {
    applyPayload(payload, {
      sourceLabel: bridge.label,
      bridgeLabel: bridge.kind
    });
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

    applyPayload(payload, {
      sourceLabel: "chunk bridge",
      bridgeLabel: "chunked-execute"
    });
  };

  function notifyParentReady() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: UI_READY_EVENT_NAME }, "*");
    }
  }

  render({ args: [], lots: [], updatedAt: null, eventName: UI_EVENT_NAME });
  notifyParentReady();
  setTimeout(notifyParentReady, 300);
  setTimeout(notifyParentReady, 1200);
}());
