const DEFAULT_SERVER = "ws://127.0.0.1:12346";

const el = (id) => document.getElementById(id);

let countdownTimer = null;

async function init() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  el("serverUrl").value = serverUrl || DEFAULT_SERVER;
}

el("btnSave").addEventListener("click", async () => {
  const serverUrl = el("serverUrl").value.trim() || DEFAULT_SERVER;
  await chrome.storage.local.set({ serverUrl });
  const status = el("saveStatus");
  status.textContent = "已保存";
  status.style.color = "#4CAF50";
  setTimeout(() => { status.textContent = ""; }, 1500);
});

el("btnConnect").addEventListener("click", () => {
  const serverUrl = el("serverUrl").value.trim() || DEFAULT_SERVER;
  chrome.storage.local.set({ serverUrl });
  updateRetryUI("connecting", { retryCount: 0, maxRetries: 3, nextRetryAt: null, retryIntervalMs: 15000 });
  chrome.runtime.sendMessage({ type: "check_connection" });
});

el("btnDisconnect").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "disconnect" });
});

function updateRetryUI(status, retry) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  const box = el("retryBox");
  const line = el("retryLine");
  box.style.display = "block";

  if (status === "connecting") {
    line.className = "retry-line connecting";
    const count = retry?.retryCount ?? 0;
    const max = retry?.maxRetries ?? 3;
    if (count > 0) {
      line.textContent = `正在连接 (${count}/${max})…`;
    } else {
      line.textContent = "正在连接…";
    }
  } else if (status === "connected") {
    line.className = "retry-line success";
    line.textContent = "已连接到服务端";
  } else if (status === "error") {
    if (retry?.nextRetryAt) {
      line.className = "retry-line countdown";
      startCountdown(retry);
    } else {
      line.className = "retry-line error";
      line.textContent = "连接错误";
    }
  } else if (status === "disconnected") {
    if (retry?.nextRetryAt) {
      line.className = "retry-line countdown";
      startCountdown(retry);
    } else {
      line.className = "retry-line";
      line.textContent = "未连接";
    }
  }
}

function startCountdown(retry) {
  const line = el("retryLine");
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((retry.nextRetryAt - Date.now()) / 1000));
    line.textContent = `${remaining}秒后重连 (本轮第${retry.retryCount}次失败)`;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };
  tick();
  countdownTimer = setInterval(tick, 200);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "status_update") {
    updateRetryUI(msg.status, msg.retry);
  }
});

chrome.runtime.sendMessage({ type: "get_status" }, (res) => {
  if (res?.status) updateRetryUI(res.status, res.retry);
});

init();
