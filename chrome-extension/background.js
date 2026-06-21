const MENU_ID = "feedback-helper";
const DEFAULT_SERVER = "ws://localhost:3456";
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 15000;
const HEALTH_CHECK_ALARM = "health-check";
const PING_TIMEOUT_MS = 5000;

let retryCount = 0;
let retryTimer = null;
let nextRetryAt = null;
let ws = null;
let pendingRequests = new Map();

// ── badge ──

function updateBadge(status) {
  chrome.action.setBadgeText({ text: "●" });
  if (status === "connected") {
    chrome.action.setBadgeBackgroundColor({ color: [76, 175, 80, 255] });
  } else if (status === "connecting") {
    chrome.action.setBadgeBackgroundColor({ color: [255, 152, 0, 255] });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: [158, 158, 158, 255] });
  }
}

function getRetryState() {
  return { retryCount, maxRetries: MAX_RETRIES, nextRetryAt, retryIntervalMs: RETRY_INTERVAL_MS };
}

// ── WebSocket ──

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  const base = serverUrl || DEFAULT_SERVER;
  // Convert http:// to ws:// if needed
  return base.replace(/^http/, "ws");
}

function connect() {
  return new Promise(async (resolve) => {
    const url = await getServerUrl();
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(true);
      return;
    }

    setStatus("connecting");

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        retryCount = 0;
        clearRetryTimer();
        setStatus("connected");
        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") {
            // Handled by ping timer
            return;
          }
          if (msg.type === "feedback_result" && msg.requestId) {
            const pending = pendingRequests.get(msg.requestId);
            if (pending) {
              pending.resolve(msg);
              pendingRequests.delete(msg.requestId);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        ws = null;
        setStatus("disconnected");
        handleRetry();
      };

      ws.onerror = () => {
        ws = null;
        handleRetry();
      };
    } catch {
      handleRetry();
      resolve(false);
    }
  });
}

function ping() {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => resolve(false), PING_TIMEOUT_MS);

    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "pong") {
          clearTimeout(timeout);
          ws.removeEventListener("message", handler);
          resolve(true);
        }
      } catch {}
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ type: "ping" }));
  });
}

async function checkConnection() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  if (!serverUrl && !(await chrome.storage.local.get("serverUrl")).serverUrl) {
    // No server configured and no default
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    await connect();
  } else {
    // Already connected, just ping
    const ok = await ping();
    if (!ok) {
      setStatus("disconnected");
      handleRetry();
    }
  }
}

function setStatus(status) {
  chrome.storage.local.set({ connectionStatus: status });
  updateBadge(status);
  broadcast({ type: "status_update", status, retry: getRetryState() });
}

function handleRetry() {
  retryCount++;

  if (retryCount <= MAX_RETRIES) {
    setStatus("connecting");
    retryTimer = setTimeout(() => connect(), 1000);
  } else {
    setStatus("disconnected");
    nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
    retryTimer = setTimeout(() => {
      retryCount = 0;
      nextRetryAt = null;
      connect();
    }, RETRY_INTERVAL_MS);
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  nextRetryAt = null;
}

// ── broadcast ──

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── messages ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "get_status": {
      chrome.storage.local.get("connectionStatus").then(({ connectionStatus }) => {
        sendResponse({
          status: connectionStatus || "disconnected",
          retry: getRetryState(),
        });
      });
      return true;
    }
    case "update_badge": {
      updateBadge(msg.status);
      break;
    }
    case "check_connection": {
      retryCount = 0;
      clearRetryTimer();
      checkConnection();
      break;
    }
    case "submit_feedback": {
      handleFeedbackSubmit(msg.data, sendResponse);
      return true;
    }
  }
});

async function handleFeedbackSubmit(data, sendResponse) {
  await connect();

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    sendResponse({ ok: false, error: "无法连接到反馈服务" });
    return;
  }

  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  pendingRequests.set(requestId, { resolve: sendResponse });

  ws.send(JSON.stringify({ type: "feedback", data, requestId }));

  // Timeout after 10s
  setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      pendingRequests.delete(requestId);
      sendResponse({ ok: false, error: "请求超时" });
    }
  }, 10000);
}

// ── install ──

chrome.runtime.onInstalled.addListener(async () => {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  if (!serverUrl) {
    await chrome.storage.local.set({ serverUrl: DEFAULT_SERVER });
  }

  chrome.contextMenus.create({
    id: MENU_ID,
    title: "📝 Call Your Claude",
    contexts: ["selection"],
  });

  connect();
});

// ── startup ──

chrome.runtime.onStartup.addListener(() => {
  retryCount = 0;
  clearRetryTimer();
  connect();
});

// ── periodic heartbeat ──

chrome.alarms.create(HEALTH_CHECK_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEALTH_CHECK_ALARM) {
    const { connectionStatus } = await chrome.storage.local.get("connectionStatus");
    if (connectionStatus === "connected") {
      const ok = await ping();
      if (!ok) {
        setStatus("disconnected");
        handleRetry();
      }
    }
  }
});

// ── context menu ──

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_FEEDBACK",
      selection: info.selectionText,
    });
  }
});
