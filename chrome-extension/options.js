const DEFAULT_SERVER = "http://localhost:3456";

const el = (id) => document.getElementById(id);

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

el("btnTest").addEventListener("click", async () => {
  const serverUrl = el("serverUrl").value.trim() || DEFAULT_SERVER;
  const statusBox = el("statusBox");
  const statusLine = el("statusLine");

  statusBox.style.display = "block";
  statusLine.className = "retry-line connecting";
  statusLine.textContent = "正在测试连接…";

  await chrome.storage.local.set({ serverUrl });

  // Delegate connection test to background via WebSocket
  chrome.runtime.sendMessage({ type: "check_connection" });

  // Wait and check status
  setTimeout(async () => {
    const { connectionStatus } = await chrome.storage.local.get("connectionStatus");
    if (connectionStatus === "connected") {
      statusLine.className = "retry-line success";
      statusLine.textContent = `连接成功 — ${serverUrl}`;
      await chrome.storage.local.set({ connectionStatus: "connected" });
      chrome.runtime.sendMessage({ type: "update_badge", status: "connected" });
    } else {
      statusLine.className = "retry-line error";
      statusLine.textContent = `连接失败 — 请确认服务已启动`;
      await chrome.storage.local.set({ connectionStatus: "disconnected" });
      chrome.runtime.sendMessage({ type: "update_badge", status: "disconnected" });
    }
  }, 2000);
});

init();
