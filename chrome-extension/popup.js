const DEFAULT_SERVER = "http://localhost:3456";

const el = (id) => document.getElementById(id);
let countdownTimer = null;

async function loadConfig() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  el("serverUrl").value = serverUrl || DEFAULT_SERVER;
}

function updateStatusUI(status, retry) {
  el("statusDot").className = "dot " + status;
  const labels = { connected: "已连接", connecting: "连接中…", disconnected: "未连接" };
  el("statusText").textContent = labels[status] || status;
  updateRetryInfo(status, retry);
}

function updateRetryInfo(status, retry) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const el = document.getElementById("retryInfo");
  if (!el) return;

  el.textContent = "";
  el.className = "retry-info";

  if (status === "connecting" && retry?.retryCount > 0) {
    el.textContent = `正在连接 (${retry.retryCount}/${retry.maxRetries})…`;
  } else if (status === "disconnected" && retry?.nextRetryAt) {
    startCountdown(retry);
  }
}

function startCountdown(retry) {
  const el = document.getElementById("retryInfo");
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((retry.nextRetryAt - Date.now()) / 1000));
    el.textContent = `${remaining}秒后重连 (本轮第${retry.retryCount}次失败)`;
    el.style.color = "#FF9800";
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
  updateStatusUI("connecting");
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
    updateStatusUI(msg.status, msg.retry);
  }
});

chrome.runtime.sendMessage({ type: "get_status" }, (res) => {
  if (res?.status) updateStatusUI(res.status, res.retry);
});

loadConfig();
