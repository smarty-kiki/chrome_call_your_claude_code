# Call Your Claude

浏览器划词，一键直达 Claude Code。

在任意网页上选中内容，弹出面板描述问题，敲一下回车，Claude Code 的终端里就收到了完整的上下文 prompt — 不用离开浏览器，不用手动 copy/paste。

## 为什么用它

**零切换。** 看网页时遇到问题，选中、描述、发送，Claude Code 立刻拿到页面链接、选中内容和你的问题描述。不需要切窗口、建文件、手拼 prompt。

**精确定位。** 除了划词，还可以按 `Cmd+/`（Windows `Ctrl+/`）进入元素选择模式，鼠标悬停高亮，点击即选中 DOM 元素，CSS 选择器和内容自动填入面板。Claude 知道你在说页面上的哪个按钮、哪个表格。

**直接注入终端。** 服务端通过 tmux 把 prompt 贴进 Claude Code 的交互会话并自动回车，跟你手动打字一样。真正的 "call your claude"。

**跨机器。** 浏览器插件和 WebSocket 服务端分离部署 — 你可以在开发机上跑 Claude Code，在笔记本浏览器上发反馈。

**轻到几乎没有存在感。** 一个 WebSocket relay，一个 Chrome 插件。不启动数据库，不依赖第三方服务。

## 工作流

```
浏览器划词/选元素 → 弹出面板填写描述 → Enter 发送
    ↓
WebSocket ──→ 服务端拼装 prompt ──→ tmux paste-buffer → Claude Code 终端
```

## 快速开始

### 1. 启动服务端

在跑着 Claude Code（tmux 会话内）的机器上：

```bash
cd server
npm install
node index.js --host 0.0.0.0 --port 12346 --session claude
```

参数说明：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--host` | `0.0.0.0` | 监听地址 |
| `--port` | `3456` | 监听端口 |
| `--session` | `claude` | 目标 tmux session 名 |
| `--log-dir` | 无 | 日志输出目录，不指定则只输出到终端 |

### 2. 加载 Chrome 插件

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-extension/` 目录

### 3. 配置插件连接

插件默认连接 `ws://127.0.0.1:12346`。如果服务端在其他机器上：

- 点击插件图标 → 修改服务端地址为服务端机器 IP → 点"测试连接"
- 或者右键插件图标 → 选项 → 配置地址

连接成功时插件图标显示绿点，否则灰点或橙色闪烁。

## 使用方式

**右键划词发送**
选中网页文本 → 右键 → "Call Your Claude" → 填写问题描述 → Enter 发送

**元素选择模式**
按 `Cmd+/`（Windows `Ctrl+/`）→ 鼠标悬停选择页面元素 → 点击确认 → 填写问题描述 → Enter 发送

面板打开后按 `Esc` 关闭。

## 发送的 Prompt 结构

```
[Call Your Claude] 请帮我看看这个网页上的问题：

页面链接: https://example.com/page
页面标题: Example Page
选中元素: div.content > article:nth-child(2)

选中内容:
```
这里是选中的文本内容...
```

问题描述:
这段文字看起来有个排版问题，帮我看看...
```

## 项目结构

```
├── chrome-extension/       # Chrome 插件
│   ├── manifest.json
│   ├── background.js       # Service Worker — WebSocket 客户端、重连、消息路由
│   ├── content.js          # 页面注入脚本 — 面板 UI、元素选择器、划词捕获
│   ├── feedback.css        # 面板样式
│   ├── popup.{html,js}     # 插件弹窗 — 快速查看状态、修改地址
│   └── options.{html,js}   # 配置页
└── server/                 # WebSocket 服务端
    └── index.js            # 接收反馈 → 拼装 prompt → 通过 tmux 注入 Claude Code
```
