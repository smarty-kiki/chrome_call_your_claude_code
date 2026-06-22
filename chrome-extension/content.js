const PANEL_ID = "feedback-side-panel";
const HIGHLIGHT_CLASS = "feedback-highlight";
const PICKER_HOVER_CLASS = "feedback-picker-hover";

// ── state ──

let pickerMode = false;
let pickedSelector = null;
let pickedContent = null;
let pickerHoverEl = null;

// iframe support
const isInIframe = () => window.self !== window.top;
let iframeIndex = -1;       // this frame's index in parent's <iframe> list (top-level = -1)
let parentFrameEl = null;   // cached window.frameElement for same-origin parents

if (isInIframe()) {
  try { iframeIndex = getFrameIndex(); } catch {}
  try { parentFrameEl = window.frameElement; } catch {}
}

// ── selector utils ──

function getSelectionContainer() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function getElementSelector(el) {
  if (!el || el === document.body) return "body";

  const parts = [];
  let current = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment = `#${current.id}`;
      parts.unshift(segment);
      break;
    }

    if (current.classList.length > 0) {
      const cls = Array.from(current.classList)
        .filter(c => c !== HIGHLIGHT_CLASS && c !== PICKER_HOVER_CLASS)
        .slice(0, 2)
        .join(".");
      if (cls) segment += `.${cls}`;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
      if (siblings.length > 1) {
        segment += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
      }
    }

    parts.unshift(segment);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function getFrameIndex() {
  if (iframeIndex >= 0) return iframeIndex;
  try {
    const frames = parent.document.querySelectorAll("iframe");
    for (let i = 0; i < frames.length; i++) {
      if (frames[i] === window.frameElement) return i;
    }
  } catch {}
  return -1;
}

function buildFullSelector(localSelector, frameIdx) {
  if (frameIdx < 0 || isInIframe()) return localSelector;
  return `iframe:nth-of-type(${frameIdx + 1}) > ${localSelector}`;
}

// ── highlight ──

function highlightContainer(el) {
  if (!el) return;
  unhighlightContainer();
  el.classList.add(HIGHLIGHT_CLASS);
}

function unhighlightContainer() {
  const el = document.querySelector(`.${HIGHLIGHT_CLASS}`);
  if (el) el.classList.remove(HIGHLIGHT_CLASS);
}

// ── picker (iframe) ──

function isPanelElement(el) {
  const panel = document.getElementById(PANEL_ID);
  return panel && (panel === el || panel.contains(el));
}

function onPickerMouseOver(e) {
  const el = e.target;
  if (!el || el === document.body || el === document.documentElement || isPanelElement(el)) return;

  if (pickerHoverEl && pickerHoverEl !== el) {
    pickerHoverEl.classList.remove(PICKER_HOVER_CLASS);
  }
  el.classList.add(PICKER_HOVER_CLASS);
  pickerHoverEl = el;
}

function onPickerClick(e) {
  const el = e.target;
  if (!el || el === document.body || el === document.documentElement || isPanelElement(el)) return;

  e.preventDefault();
  e.stopPropagation();

  const localSelector = getElementSelector(el);
  const content = (el.textContent || "").trim().slice(0, 500);
  const fIdx = getFrameIndex();

  if (isInIframe()) {
    parent.postMessage({
      type: "fyc-iframe-picker-result",
      selector: localSelector,
      content: content,
      iframeIndex: fIdx,
      frameUrl: location.href,
    }, "*");
  } else {
    pickedSelector = buildFullSelector(localSelector, fIdx);
    pickedContent = content;
    openPanel({ selection: pickedContent, selector: pickedSelector });
  }
}

function onPickerMouseMove(e) {
  if (typeof updatePanelSide === "function") {
    updatePanelSide(e.clientX);
  }
}

function enterPickerMode() {
  pickerMode = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onPickerMouseOver, true);
  document.addEventListener("mousemove", onPickerMouseMove, true);
  document.addEventListener("click", onPickerClick, true);
  if (!isInIframe()) setupIframeHighlights();
}

function exitPickerMode() {
  pickerMode = false;
  document.body.style.cursor = "";
  document.removeEventListener("mouseover", onPickerMouseOver, true);
  document.removeEventListener("mousemove", onPickerMouseMove, true);
  document.removeEventListener("click", onPickerClick, true);
  if (pickerHoverEl) {
    pickerHoverEl.classList.remove(PICKER_HOVER_CLASS);
    pickerHoverEl = null;
  }
  if (!isInIframe()) clearIframeHighlights();
}

// ── iframe visual highlights (top-level only) ──

function setupIframeHighlights() {
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe, index) => {
    iframe.classList.add("fyc-iframe-highlight");
    iframe.dataset.fycIframeIndex = index + 1;

    iframe.addEventListener("mouseenter", () => {
      iframe.classList.add("fyc-iframe-highlight--active");
    });
    iframe.addEventListener("mouseleave", () => {
      iframe.classList.remove("fyc-iframe-highlight--active");
    });
  });
}

function clearIframeHighlights() {
  document.querySelectorAll("iframe.fyc-iframe-highlight").forEach((iframe) => {
    iframe.classList.remove("fyc-iframe-highlight", "fyc-iframe-highlight--active");
    delete iframe.dataset.fycIframeIndex;
  });
}

// ── broadcast to iframes ──

function broadcastToIframes(msg) {
  if (isInIframe()) return;
  try {
    for (let i = 0; i < parent.frames.length; i++) {
      try { parent.frames[i].postMessage(msg, "*"); } catch {}
    }
  } catch {}
}

// ── panel ──

function getPanelSide() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0) {
      const center = rect.left + rect.width / 2;
      return center < window.innerWidth / 2 ? "right" : "left";
    }
  }
  return "left";
}

function updatePanelSide(mouseX) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const side = mouseX < window.innerWidth / 2 ? "right" : "left";
  panel.classList.remove("feedback-panel--left", "feedback-panel--right");
  panel.classList.add(`feedback-panel--${side}`);
}

function createPanel({ selection, selector, frameUrl }) {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = `feedback-panel feedback-panel--${getPanelSide()}`;

  let urlFieldHtml = `<label>页面链接</label>
        <div class="feedback-panel__url">${escapeHtml(location.href)}</div>`;
  if (frameUrl) {
    urlFieldHtml = `<label>父页面链接</label>
        <div class="feedback-panel__url">${escapeHtml(location.href)}</div>
        <div class="feedback-panel__field" style="margin-top:8px">
          <label>iframe 链接</label>
          <div class="feedback-panel__url feedback-panel__url--iframe">${escapeHtml(frameUrl)}</div>
        </div>`;
  }

  panel.innerHTML = `
    <div class="feedback-panel__header-right">
      <span class="feedback-panel__shortcut">Esc</span>
      <button class="feedback-panel__close" id="feedback-close">&times;</button>
    </div>
    <div class="feedback-panel__inner">
      <h2 class="feedback-panel__title">Call Your Claude</h2>
      <div class="feedback-panel__field">
        ${urlFieldHtml}
      </div>
      <div class="feedback-panel__field">
        <label>选中元素</label>
        <div class="feedback-panel__selector" id="feedback-selector">${escapeHtml(selector || "-")}</div>
      </div>
      <div class="feedback-panel__field">
        <label>选中内容</label>
        <div class="feedback-panel__selection" id="feedback-selection">${escapeHtml(selection || "")}</div>
      </div>
      <div class="feedback-panel__field">
        <label for="feedback-description">问题描述</label>
        <textarea
          id="feedback-description"
          class="feedback-panel__textarea"
          placeholder="请描述你遇到的问题..."
          rows="6"
        ></textarea>
        <div class="feedback-panel__textarea-hint">Shift + Enter 换行</div>
      </div>
      <div class="feedback-panel__actions">
        <span class="feedback-panel__shortcut feedback-panel__shortcut--enter">Enter</span>
        <button class="feedback-panel__btn feedback-panel__btn--submit" id="feedback-submit">发给 Claude Code</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  document.addEventListener("keydown", onPanelEsc);
  requestAnimationFrame(() => panel.classList.add("feedback-panel--open"));

  panel.querySelector("#feedback-close").addEventListener("click", () => {
    exitPickerMode();
    closePanel();
  });

  panel.querySelector("#feedback-submit").addEventListener("click", () => {
    submitFeedback();
  });

  panel.querySelector("#feedback-description").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitFeedback();
    }
  });

  const textarea = panel.querySelector("#feedback-description");
  if (textarea) textarea.focus();
}

function openPanel({ selection, selector, frameUrl }) {
  unhighlightContainer();
  exitPickerMode();
  closePanel();
  createPanel({ selection, selector, frameUrl });
}

function closePanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.classList.remove("feedback-panel--open");
  setTimeout(() => panel.remove(), 300);
}

function onPanelEsc(e) {
  if (e.key === "Escape") {
    exitPickerMode();
    closePanel();
  }
}

// ── submit ──

async function submitFeedback() {
  const selectionEl = document.getElementById("feedback-selection");
  const selectorEl = document.getElementById("feedback-selector");
  const textarea = document.getElementById("feedback-description");
  const submitBtn = document.getElementById("feedback-submit");

  const selection = selectionEl ? selectionEl.textContent : "";
  const selector = selectorEl ? selectorEl.textContent : "";
  const description = textarea ? textarea.value.trim() : "";

  if (!description) {
    showToast("请填写问题描述");
    if (textarea) textarea.focus();
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "发送中...";
  }

  closePanel();

  let parentUrl;
  if (isInIframe()) {
    try { parentUrl = parent.location.href; } catch {}
  }

  let prompt;
  if (parentUrl) {
    prompt = `[Call Your Claude] 请帮我看看这个网页上的问题（iframe 内选中）：\n\n父页面链接: ${parentUrl}\niframe 链接: ${location.href}`;
  } else {
    prompt = `[Call Your Claude] 请帮我看看这个网页上的问题：\n\n页面链接: ${location.href}`;
  }
  if (document.title) prompt += `\n页面标题: ${document.title}`;
  if (selector) prompt += `\n选中元素: ${selector}`;
  if (selection) {
    prompt += `\n\n选中内容:\n\`\`\`\n${selection}\n\`\`\``;
  }
  prompt += `\n问题描述:\n${description}`;

  try {
    const result = await chrome.runtime.sendMessage({
      type: "submit_feedback",
      prompt,
    });

    if (result && result.ok) {
      showToast("反馈提交成功");
    } else {
      throw new Error(result?.error || "Server error");
    }
  } catch {
    showToast("提交失败，请确保反馈服务已启动");
  }
}

// ── toast ──

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "feedback-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("feedback-toast--show"));
  setTimeout(() => {
    toast.classList.remove("feedback-toast--show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── entry points ──

function openFromSelection(text) {
  const container = getSelectionContainer();
  const selector = container ? getElementSelector(container) : "-";
  highlightContainer(container);
  createPanel({ selection: text, selector });
}

function openFromPicker() {
  createPanel({ selection: null, selector: null });
  enterPickerMode();
}

// keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "\\")) {
    e.preventDefault();
    openFromPicker();
  }
});

// ── iframe message handlers ──

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_FEEDBACK") {
    openFromSelection(msg.selection);
    return;
  }

  if (msg.type === "PICKER_MODE_START") {
    openFromPicker();
    return;
  }
});

// Listen for iframe picker results (top-level page only)
if (!isInIframe()) {
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "fyc-iframe-picker-result") {
      clearIframeHighlights();
      const { selector, content, iframeIndex, frameUrl } = event.data;
      if (selector && !pickedSelector) {
        pickedSelector = buildFullSelector(selector, iframeIndex);
        pickedContent = content;
        openPanel({ selection: pickedContent, selector: pickedSelector, frameUrl });
      }
    }

    if (event.data && event.data.type === "fyc-iframe-ready") {
      if (pickerMode) {
        broadcastToIframes({ type: "PICKER_MODE_START" });
      }
    }
  });
}

// Iframe: notify parent that we're ready, and listen for picker mode broadcast
if (isInIframe()) {
  window.addEventListener("load", () => {
    try { parent.postMessage({ type: "fyc-iframe-ready" }, "*"); } catch {}
  });

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "PICKER_MODE_START") {
      // Only enter picker mode if not already active in this frame
      if (!pickerMode) {
        openFromPicker();
      }
    }
  });
}
