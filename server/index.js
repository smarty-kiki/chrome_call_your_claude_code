const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const PORT = parseInt(parseArg("port", "3456"), 10);
const HOST = parseArg("host", "0.0.0.0");
const LOG_DIR = parseArg("log-dir", null);
const TMUX_SESSION = parseArg("session", "claude");

function sendToTmux(prompt) {
  return new Promise((resolve, reject) => {
    const load = spawn("tmux", ["load-buffer", "-"]);
    load.stdin.write(prompt);
    load.stdin.end();

    load.on("close", (code) => {
      if (code !== 0) return reject(new Error(`tmux load-buffer exited with code ${code}`));

      const paste = spawn("tmux", ["paste-buffer", "-t", TMUX_SESSION]);
      paste.on("close", (code) => {
        if (code === 0) {
          const enter = spawn("tmux", ["send-keys", "-t", TMUX_SESSION, "Enter"]);
          enter.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`tmux send-keys exited with code ${code}`));
          });
          enter.on("error", reject);
        } else {
          reject(new Error(`tmux paste-buffer exited with code ${code}`));
        }
      });
      paste.on("error", reject);
    });

    load.on("error", (err) => {
      reject(new Error(`无法执行 tmux: ${err.message}`));
    });
  });
}

function logPrompt(prompt) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`[${ts}] 反馈收到`);
  console.log(prompt);
  console.log("---");

  if (LOG_DIR) {
    const file = path.join(LOG_DIR, `feedback-${ts}.txt`);
    fs.writeFileSync(file, prompt, "utf-8");
    console.log(`[已写入日志] ${file}`);
  }
}

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on("connection", (ws) => {
  console.log("[WebSocket] 客户端已连接");

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "feedback": {
          const { prompt } = msg || {};
          const requestId = msg.requestId;
          if (!prompt || typeof prompt !== "string") {
            ws.send(JSON.stringify({ type: "feedback_result", requestId, ok: false, error: "缺少 prompt" }));
            return;
          }

          logPrompt(prompt);

          try {
            await sendToTmux(prompt);
            console.log("[已发送到 tmux]");
            ws.send(JSON.stringify({ type: "feedback_result", requestId, ok: true }));
          } catch (err) {
            console.error("[发送失败]", err.message);
            ws.send(JSON.stringify({ type: "feedback_result", requestId, ok: false, error: err.message }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", error: `未知消息类型: ${msg.type}` }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", error: err.message }));
    }
  });

  ws.on("close", () => {
    console.log("[WebSocket] 客户端已断开");
  });

  ws.on("error", (err) => {
    console.error("[WebSocket] 连接错误:", err.message);
  });
});

console.log(`Call Your Claude WebSocket 服务已启动: ws://${HOST}:${PORT}`);
console.log(`目标 tmux session: ${TMUX_SESSION}`);
