const DEFAULT_SERVER = "ws://127.0.0.1:12346";

const el = (id) => document.getElementById(id);

let countdownTimer = null;

async function loadConfig() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  el("serverUrl").value = serverUrl || DEFAULT_SERVER;
}

function updateStatusUI(data) {
  el("statusDot").className = "dot " + data.status;
  const labels = { connected: "已连接", connecting: "连接中…", disconnected: "未连接", error: "连接错误" };
  el("statusText").textContent = labels[data.status] || data.status;
  updateRetryInfo(data);
}

function updateRetryInfo(data) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const info = el("retryInfo");
  info.textContent = "";
  info.style.color = "#FF9800";

  const { status, retry } = data;

  if (status === "connecting" && retry) {
    if (retry.retryCount > 0) {
      info.textContent = `正在连接 (${retry.retryCount}/${retry.maxRetries})…`;
    } else {
      info.textContent = "正在连接…";
    }
  } else if (status === "error" && retry?.nextRetryAt) {
    startCountdown(retry);
  } else if (status === "disconnected" && retry?.nextRetryAt) {
    startCountdown(retry);
  } else if (status === "error") {
    info.textContent = "连接失败";
    info.style.color = "#F44336";
  }
}

function startCountdown(retry) {
  const info = el("retryInfo");
  info.style.color = "#FF9800";
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((retry.nextRetryAt - Date.now()) / 1000));
    info.textContent = `${remaining}秒后重连 (本轮第${retry.retryCount}次失败)`;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };
  tick();
  countdownTimer = setInterval(tick, 200);
}

el("btnConnect").addEventListener("click", async () => {
  const serverUrl = el("serverUrl").value.trim() || DEFAULT_SERVER;
  await chrome.storage.local.set({ serverUrl });
  chrome.runtime.sendMessage({ type: "check_connection" });
});

el("btnSave").addEventListener("click", async () => {
  const serverUrl = el("serverUrl").value.trim() || DEFAULT_SERVER;
  await chrome.storage.local.set({ serverUrl });
  chrome.runtime.sendMessage({ type: "check_connection" });
});

el("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "status_update") {
    updateStatusUI(msg);
  }
});

chrome.runtime.sendMessage({ type: "get_status" }, (res) => {
  if (res?.status) updateStatusUI(res);
});

loadConfig();
