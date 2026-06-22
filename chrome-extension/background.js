const MENU_ID = "feedback-helper";
const DEFAULT_SERVER = "ws://127.0.0.1:12346";
const KEEPALIVE_ALARM = "keepalive";
const PING_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 15000;

let currentStatus = "disconnected";
let ws = null;
let pendingRequests = new Map();
let retryCount = 0;
let nextRetryAt = null;
let retryTimer = null;
let connecting = false;

// ── badge ──

function updateBadge(status) {
  const map = {
    connected:    { text: "✓", color: "#4CAF50" },
    connecting:   { text: "…", color: "#FF9800" },
    disconnected: { text: "✕", color: "#9E9E9E" },
    error:        { text: "!", color: "#F44336" },
  };
  const { text, color } = map[status] || map.disconnected;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── WebSocket ──

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  return serverUrl || DEFAULT_SERVER;
}

function setStatus(status) {
  if (currentStatus === status) return;
  currentStatus = status;
  updateBadge(status);
  broadcast({
    type: "status_update",
    status,
    retry: { retryCount, maxRetries: MAX_RETRIES, retryIntervalMs: RETRY_INTERVAL_MS, nextRetryAt },
  });
}

function getRetryState() {
  return { retryCount, maxRetries: MAX_RETRIES, retryIntervalMs: RETRY_INTERVAL_MS, nextRetryAt };
}

function connect() {
  return new Promise(async (resolve) => {
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      if (ws.readyState === WebSocket.CONNECTING) {
        resolve(false);
        return;
      }
      try { ws.close(); } catch {}
      ws = null;
    }

    const url = await getServerUrl();
    setStatus("connecting");

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        retryCount = 0;
        nextRetryAt = null;
        connecting = false;
        setStatus("connected");
        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;
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
        if (currentStatus === "connected") {
          onConnectFailed();
        } else if (connecting) {
          onConnectFailed();
        }
        resolve(false);
      };

      ws.onerror = () => {};
    } catch {
      onConnectFailed();
      resolve(false);
    }
  });
}

function onConnectFailed() {
  ws = null;
  retryCount++;

  if (retryCount >= MAX_RETRIES) {
    connecting = false;
    nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
    setStatus("error");
    retryTimer = setTimeout(() => {
      retryCount = 0;
      nextRetryAt = null;
      connecting = true;
      setStatus("connecting");
      connect();
    }, RETRY_INTERVAL_MS);
  } else {
    retryTimer = setTimeout(() => {
      connect();
    }, 1000);
  }
}

function cancelRetry() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  nextRetryAt = null;
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

async function tryConnect() {
  if (currentStatus === "connected" || connecting) return;

  // Respect retry cooldown
  if (nextRetryAt && nextRetryAt > Date.now()) return;

  cancelRetry();
  connecting = true;
  retryCount = 0;
  setStatus("connecting");
  connect();
}

// ── broadcast ──

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── messages ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "get_status": {
      sendResponse({ status: currentStatus, retry: getRetryState() });
      return true;
    }
    case "disconnect": {
      cancelRetry();
      connecting = false;
      retryCount = 0;
      nextRetryAt = null;
      if (ws) {
        try { ws.close(); } catch {}
        ws = null;
      }
      setStatus("disconnected");
      break;
    }
    case "check_connection": {
      cancelRetry();
      connecting = false;
      retryCount = 0;
      nextRetryAt = null;
      tryConnect();
      break;
    }
    case "submit_feedback": {
      handleFeedbackSubmit(msg.data, sendResponse);
      return true;
    }
  }
});

async function handleFeedbackSubmit(prompt, sendResponse) {
  await connect();

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    sendResponse({ ok: false, error: "无法连接到反馈服务" });
    return;
  }

  if (!prompt || typeof prompt !== "string") {
    sendResponse({ ok: false, error: "缺少 prompt" });
    return;
  }

  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  pendingRequests.set(requestId, { resolve: sendResponse });

  ws.send(JSON.stringify({ type: "feedback", prompt, requestId }));

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

  tryConnect();
});

// ── startup ──

chrome.runtime.onStartup.addListener(() => {
  tryConnect();
});

// ── keepalive alarm (15s) ──

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.25 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    if (currentStatus === "connected") {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const ok = await ping();
        if (!ok) {
          try { ws.close(); } catch {}
          onConnectFailed();
        }
      } else {
        onConnectFailed();
      }
    }
    if (currentStatus === "disconnected" || currentStatus === "error") {
      tryConnect();
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
