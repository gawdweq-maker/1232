(function () {
  "use strict";

  var textElement = document.getElementById("signText");
  var debugPanel = document.getElementById("debugPanel");
  var debugInput = document.getElementById("debugInput");
  var lastText = document.getElementById("lastText");
  var statusBadge = document.getElementById("statusBadge");
  var modeValue = document.getElementById("modeValue");
  var charCount = document.getElementById("charCount");
  var lineCount = document.getElementById("lineCount");
  var readyState = document.getElementById("readyState");
  var applyButton = document.getElementById("applyButton");
  var clearButton = document.getElementById("clearButton");
  var signContent = document.querySelector(".sign-content");
  var rootStyle = document.documentElement.style;
  var url = new URL(window.location.href);
  var debugForced = url.searchParams.get("debug") === "1";

  var state = {
    text: "",
    readySent: false,
    clampApplied: false
  };

  var bridge = detectBridge();
  var runtimeMode = bridge.kind !== "standalone";
  var debugVisible = debugForced || !runtimeMode;

  document.body.classList.toggle("runtime-mode", runtimeMode && !debugVisible);

  if (!debugVisible) {
    debugPanel.hidden = true;
  }

  modeValue.textContent = bridge.kind;
  updateStatus(runtimeMode ? "connected" : "standalone", false);
  updateDebugState();

  bridge.bind(setText);
  registerLocalDebugHooks();
  bindDebugControls();
  emitReady();
  setText(url.searchParams.get("text") || "");

  if (!runtimeMode && !url.searchParams.get("text")) {
    setText("WELCOME TO\nTHE TEST SIGN");
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(refitText).observe(signContent);
  } else {
    window.addEventListener("resize", refitText);
  }

  function detectBridge() {
    var altBridge = window.alt;
    if (altBridge && typeof altBridge.emit === "function") {
      return {
        kind: "alt-webview",
        bind: function (handler) {
          if (typeof altBridge.on === "function") {
            altBridge.on("setText", handler);
          }
        },
        emitReady: function () {
          altBridge.emit("signReady");
        }
      };
    }

    var mpBridge = window.mp;
    if (mpBridge && typeof mpBridge.trigger === "function") {
      return {
        kind: "mp-cef",
        bind: function (handler) {
          if (mpBridge.events && typeof mpBridge.events.add === "function") {
            mpBridge.events.add("setText", handler);
          }
        },
        emitReady: function () {
          mpBridge.trigger("signReady");
        }
      };
    }

    return {
      kind: "standalone",
      bind: function () {},
      emitReady: function () {}
    };
  }

  function normalizeText(value) {
    if (value == null) {
      return "";
    }

    return String(value).replace(/\r\n?/g, "\n");
  }

  function setText(value) {
    state.text = normalizeText(value);
    state.clampApplied = false;

    textElement.classList.remove("is-clamped");
    textElement.textContent = state.text || " ";
    textElement.title = state.text;

    if (debugInput && document.activeElement !== debugInput) {
      debugInput.value = state.text;
    }

    refitText();
    updateDebugState();
  }

  function refitText() {
    var contentWidth = signContent.clientWidth;
    var contentHeight = signContent.clientHeight;

    if (!contentWidth || !contentHeight) {
      return;
    }

    textElement.classList.remove("is-clamped");
    state.clampApplied = false;

    var maxFont = Math.max(40, Math.min(contentWidth / 5.6, contentHeight / 1.55));
    var minFont = Math.max(18, Math.min(contentWidth / 15.5, contentHeight / 5.4));
    var fontSize = Math.floor(maxFont);
    var fitted = false;

    while (fontSize >= minFont) {
      rootStyle.setProperty("--font-size", fontSize + "px");

      if (fits()) {
        fitted = true;
        break;
      }

      fontSize -= 1;
    }

    if (!fitted) {
      rootStyle.setProperty("--font-size", Math.floor(minFont) + "px");
      textElement.classList.add("is-clamped");
      state.clampApplied = true;
    }

    updateDebugState();
  }

  function fits() {
    return textElement.scrollWidth <= signContent.clientWidth + 1 &&
      textElement.scrollHeight <= signContent.clientHeight + 1;
  }

  function bindDebugControls() {
    if (!debugInput) {
      return;
    }

    applyButton.addEventListener("click", function () {
      setText(debugInput.value);
    });

    clearButton.addEventListener("click", function () {
      debugInput.value = "";
      setText("");
    });

    debugInput.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        setText(debugInput.value);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-preset]"), function (button) {
      button.addEventListener("click", function () {
        var value = (button.getAttribute("data-preset") || "").replace(/\\n/g, "\n");
        debugInput.value = value;
        setText(value);
      });
    });
  }

  function registerLocalDebugHooks() {
    window.setText = setText;

    window.addEventListener("message", function (event) {
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (event.data.type === "setText") {
        setText(event.data.text);
      }
    });

    window.addEventListener("sign:setText", function (event) {
      if (event.detail && Object.prototype.hasOwnProperty.call(event.detail, "text")) {
        setText(event.detail.text);
      }
    });
  }

  function emitReady() {
    if (state.readySent) {
      return;
    }

    state.readySent = true;
    bridge.emitReady();
    readyState.textContent = runtimeMode ? "sent" : "local";
  }

  function updateStatus(label, pending) {
    statusBadge.textContent = label;
    statusBadge.classList.toggle("is-pending", !!pending);
  }

  function updateDebugState() {
    var currentText = state.text;
    var lines = currentText ? currentText.split("\n").length : 0;

    charCount.textContent = String(currentText.length);
    lineCount.textContent = String(lines);
    lastText.textContent = currentText || "(empty)";

    if (state.clampApplied) {
      updateStatus("clamped", false);
    } else if (runtimeMode) {
      updateStatus("connected", false);
    } else {
      updateStatus("standalone", false);
    }
  }
}());
