const PANEL_ID = "feedback-side-panel";
const HIGHLIGHT_CLASS = "feedback-highlight";
const PICKER_HOVER_CLASS = "feedback-picker-hover";

// ── state ──

let pickerMode = false;
let pickerHoverEl = null;

// iframe support
const isInIframe = () => window.self !== window.top;
let iframeIndex = -1;

if (isInIframe()) {
  try { iframeIndex = getFrameIndex(); } catch {}
}

// ── selector utils ──

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
  if (frameIdx < 0) return localSelector;
  return `iframe:nth-of-type(${frameIdx + 1}) > ${localSelector}`;
}

function getIframeSelector(frameIdx) {
  if (frameIdx < 0) return null;
  return `iframe:nth-of-type(${frameIdx + 1})`;
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

// ── iframe visual highlights (top-level only) ──

function setupIframeHighlights() {
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe) => {
    iframe.classList.add("fyc-iframe-highlight");
    iframe.addEventListener("mouseenter", () => iframe.classList.add("fyc-iframe-highlight--active"));
    iframe.addEventListener("mouseleave", () => iframe.classList.remove("fyc-iframe-highlight--active"));
  });
}

function clearIframeHighlights() {
  document.querySelectorAll("iframe.fyc-iframe-highlight").forEach((iframe) => {
    iframe.classList.remove("fyc-iframe-highlight", "fyc-iframe-highlight--active");
  });
}

// ── broadcast ──

function broadcastToFrames(msg) {
  if (isInIframe()) return;
  try {
    for (let i = 0; i < parent.frames.length; i++) {
      try { parent.frames[i].postMessage(msg, "*"); } catch {}
    }
  } catch {}
}

function broadcastStop() {
  broadcastToFrames({ type: "PICKER_MODE_STOP" });
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

function createPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = `feedback-panel feedback-panel--${getPanelSide()}`;

  panel.innerHTML = `
    <div class="feedback-panel__header-right">
      <span class="feedback-panel__shortcut">Esc</span>
      <button class="feedback-panel__close" id="feedback-close">&times;</button>
    </div>
    <div class="feedback-panel__inner">
      <h2 class="feedback-panel__title">Call Your Claude</h2>
      <div class="feedback-panel__field">
        <label>页面链接</label>
        <div class="feedback-panel__url" id="feedback-url">${escapeHtml(location.href)}</div>
      </div>
      <div class="feedback-panel__field feedback-panel__field--iframe-url" style="display:none">
        <label>iframe 链接</label>
        <div class="feedback-panel__url feedback-panel__url--iframe" id="feedback-iframe-url">-</div>
      </div>
      <div class="feedback-panel__field feedback-panel__field--iframe-position" style="display:none">
        <label>iframe 在父页面中的位置</label>
        <div class="feedback-panel__selector" id="feedback-iframe-position">-</div>
      </div>
      <div class="feedback-panel__field feedback-panel__field--element-selector" style="display:none">
        <label>选中元素</label>
        <div class="feedback-panel__selector" id="feedback-element-selector">-</div>
      </div>
      <div class="feedback-panel__field feedback-panel__field--iframe-element" style="display:none">
        <label>iframe 内选中元素</label>
        <div class="feedback-panel__selector" id="feedback-iframe-element">-</div>
      </div>
      <div class="feedback-panel__field">
        <label>选中内容</label>
        <div class="feedback-panel__selection feedback-panel__hint" id="feedback-selection">未选择内容</div>
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

  panel.querySelector("#feedback-close").addEventListener("click", closePanelAndExit);
  panel.querySelector("#feedback-submit").addEventListener("click", submitFeedback);

  panel.querySelector("#feedback-description").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitFeedback();
    }
  });

  const textarea = panel.querySelector("#feedback-description");
  if (textarea) setTimeout(() => textarea.focus(), 100);
}

function fillPanel({ iframePosition, iframeElement, selection, frameUrl }) {
  const elementSelEl = document.getElementById("feedback-element-selector");
  const elementSelectorField = document.querySelector(".feedback-panel__field--element-selector");
  const selectionEl = document.getElementById("feedback-selection");
  const iframeUrlField = document.querySelector(".feedback-panel__field--iframe-url");
  const iframeUrlEl = document.getElementById("feedback-iframe-url");
  const iframePositionField = document.querySelector(".feedback-panel__field--iframe-position");
  const iframePositionEl = document.getElementById("feedback-iframe-position");
  const iframeElementField = document.querySelector(".feedback-panel__field--iframe-element");
  const iframeElementEl = document.getElementById("feedback-iframe-element");

  const isIframeMode = iframePosition && iframePosition !== "-";

  // 选中元素: parent mode only
  if (elementSelEl) {
    elementSelEl.textContent = isIframeMode ? "-" : (iframeElement || "-");
  }

  if (elementSelectorField) {
    elementSelectorField.style.display = isIframeMode ? "none" : "";
  }

  // iframe 内选中元素: iframe mode only
  if (iframeElementEl) {
    iframeElementEl.textContent = iframeElement || "-";
  }

  if (selectionEl) {
    selectionEl.textContent = selection || "(空元素)";
    selectionEl.classList.remove("feedback-panel__hint");
  }

  if (iframeUrlField && iframeUrlEl) {
    if (frameUrl) {
      iframeUrlEl.textContent = frameUrl;
      iframeUrlField.style.display = "";
    } else {
      iframeUrlField.style.display = "none";
    }
  }

  if (iframePositionField && iframePositionEl) {
    iframePositionEl.textContent = iframePosition || "-";
    iframePositionField.style.display = isIframeMode ? "" : "none";
  }

  if (iframeElementField) {
    iframeElementField.style.display = isIframeMode ? "" : "none";
  }
}

function closePanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.classList.remove("feedback-panel--open");
  setTimeout(() => panel.remove(), 300);
}

function closePanelAndExit() {
  exitPickerMode();
  broadcastStop();
  closePanel();
}

function onPanelEsc(e) {
  if (e.key === "Escape") {
    exitPickerMode();
    broadcastStop();
    closePanel();
  }
}

// ── picker (top-level page) ──

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

  const selector = getElementSelector(el);
  const content = (el.textContent || "").trim().slice(0, 500);

  fillPanel({ iframePosition: "-", iframeElement: selector, selection: content });
  exitPickerMode();
  clearIframeHighlights();
  broadcastStop();
}

function onPickerMouseMove(e) {
  updatePanelSide(e.clientX);
}

function enterPickerMode() {
  pickerMode = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onPickerMouseOver, true);
  document.addEventListener("mousemove", onPickerMouseMove, true);
  document.addEventListener("click", onPickerClick, true);
  if (!isInIframe()) {
    setupIframeHighlights();
    broadcastToFrames({ type: "PICKER_MODE_START" });
  }
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
  if (!isInIframe()) {
    clearIframeHighlights();
  }
}

// ── iframe picker (iframe only, runs alongside top-level picker) ──

let iframePickerActive = false;

function onIframePickerClick(e) {
  const el = e.target;
  if (!el || el === document.body || el === document.documentElement) return;

  e.preventDefault();
  e.stopPropagation();

  const localSelector = getElementSelector(el);
  const content = (el.textContent || "").trim().slice(0, 500);
  const fIdx = getFrameIndex();

  parent.postMessage({
    type: "fyc-iframe-picker-result",
    iframePosition: getIframeSelector(fIdx),
    iframeElement: localSelector,
    content,
    frameUrl: location.href,
  }, "*");
}

function enterIframePickerMode() {
  if (iframePickerActive) return;
  iframePickerActive = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onIframeHover, true);
  document.addEventListener("click", onIframePickerClick, true);
  document.body.addEventListener("mouseleave", onIframeMouseLeave);
}

function exitIframePickerMode() {
  iframePickerActive = false;
  document.body.style.cursor = "";
  document.removeEventListener("mouseover", onIframeHover, true);
  document.removeEventListener("click", onIframePickerClick, true);
  document.body.removeEventListener("mouseleave", onIframeMouseLeave);
  document.querySelectorAll(`.${PICKER_HOVER_CLASS}`).forEach(el => el.classList.remove(PICKER_HOVER_CLASS));
}

function onIframeHover(e) {
  const el = e.target;
  if (!el || el === document.body || el === document.documentElement) return;
  document.querySelectorAll(`.${PICKER_HOVER_CLASS}`).forEach(x => x.classList.remove(PICKER_HOVER_CLASS));
  el.classList.add(PICKER_HOVER_CLASS);
}

function onIframeMouseLeave() {
  document.querySelectorAll(`.${PICKER_HOVER_CLASS}`).forEach(el => el.classList.remove(PICKER_HOVER_CLASS));
}

// ── submit ──

async function submitFeedback() {
  const selectionEl = document.getElementById("feedback-selection");
  const iframePositionEl = document.getElementById("feedback-iframe-position");
  const iframeElementEl = document.getElementById("feedback-iframe-element");
  const textarea = document.getElementById("feedback-description");
  const submitBtn = document.getElementById("feedback-submit");

  const selection = selectionEl ? selectionEl.textContent : "";
  const iframePosition = iframePositionEl ? iframePositionEl.textContent : "";
  const iframeElement = iframeElementEl ? iframeElementEl.textContent : "";
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
    prompt = `[Call Your Claude] 请帮我看看这个网页上的问题（iframe 内选中）：\n\n页面链接: ${parentUrl}\niframe 链接: ${location.href}`;
  } else {
    prompt = `[Call Your Claude] 请帮我看看这个网页上的问题：\n\n页面链接: ${location.href}`;
  }
  if (document.title) prompt += `\n页面标题: ${document.title}`;
  if (iframePosition && iframePosition !== "-") prompt += `\niframe 在父页面中的位置: ${iframePosition}`;
  if (iframeElement && iframeElement !== "-") {
    if (iframePosition && iframePosition !== "-") {
      prompt += `\niframe 内选中元素: ${iframeElement}`;
    } else {
      prompt += `\n选中元素: ${iframeElement}`;
    }
  }
  if (selection && selection !== "未选择内容" && selection !== "(空元素)") {
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
  createPanel();
  fillPanel({ iframePosition: "-", iframeElement: selector, selection: text });
}

function openFromPicker() {
  createPanel();
  enterPickerMode();
}

// keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "\\")) {
    e.preventDefault();
    if (isInIframe()) {
      // Iframe: tell parent to enter picker mode (parent will broadcast back)
      try { parent.postMessage({ type: "fyc-iframe-request-picker" }, "*"); } catch {}
    } else {
      openFromPicker();
    }
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_FEEDBACK") {
    if (isInIframe()) {
      const container = getSelectionContainer();
      const selector = container ? getElementSelector(container) : "-";
      const selection = (container ? container.textContent : msg.selection || "").trim().slice(0, 500);
      parent.postMessage({
        type: "fyc-iframe-selection",
        iframePosition: getIframeSelector(iframeIndex),
        iframeElement: selector,
        selection,
        frameUrl: location.href,
      }, "*");
    } else {
      openFromSelection(msg.selection);
    }
    return;
  }
});

// ── iframe message handlers ──

if (!isInIframe()) {
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "fyc-iframe-picker-result") {
      const { iframePosition, iframeElement, content, frameUrl } = event.data;
      if (iframeElement) {
        fillPanel({ iframePosition, iframeElement, selection: content, frameUrl });
      }
      exitPickerMode();
      clearIframeHighlights();
      broadcastStop();
      const textarea = document.getElementById("feedback-description");
      if (textarea) setTimeout(() => textarea.focus(), 100);
    }

    if (event.data && event.data.type === "fyc-iframe-selection") {
      const { iframePosition, iframeElement, selection, frameUrl } = event.data;
      createPanel();
      fillPanel({ iframePosition, iframeElement, selection, frameUrl });
      broadcastToFrames({ type: "PICKER_MODE_START" });
      const textarea = document.getElementById("feedback-description");
      if (textarea) setTimeout(() => textarea.focus(), 100);
    }

    if (event.data && event.data.type === "fyc-iframe-ready") {
      if (pickerMode) {
        broadcastToFrames({ type: "PICKER_MODE_START" });
      }
    }

    if (event.data && event.data.type === "fyc-iframe-request-picker") {
      // Iframe user pressed Cmd+/, let them pick - start picker mode on parent
      if (!pickerMode) {
        openFromPicker();
      }
    }
  });
}

if (isInIframe()) {
  window.addEventListener("load", () => {
    try { parent.postMessage({ type: "fyc-iframe-ready" }, "*"); } catch {}
  });

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "PICKER_MODE_START") {
      enterIframePickerMode();
    }
    if (event.data && event.data.type === "PICKER_MODE_STOP") {
      exitIframePickerMode();
    }
  });
}

// ── selection helper ──

function getSelectionContainer() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}
