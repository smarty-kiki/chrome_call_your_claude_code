const PANEL_ID = "feedback-side-panel";
const HIGHLIGHT_CLASS = "feedback-highlight";
const PICKER_HOVER_CLASS = "feedback-picker-hover";
let highlightedEl = null;
let pickerHoverEl = null;
let pickerMode = false;
let pickedSelector = null;
let pickedContent = null;

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

// ── highlight ──

function highlightContainer(el) {
  if (!el) return;
  unhighlightContainer();
  el.classList.add(HIGHLIGHT_CLASS);
  highlightedEl = el;
}

function unhighlightContainer() {
  if (highlightedEl) {
    highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    highlightedEl = null;
  }
}

// ── picker ──

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

  // select this element
  pickedSelector = getElementSelector(el);
  pickedContent = (el.textContent || "").trim().slice(0, 500);

  // update panel
  const selectorEl = document.getElementById("feedback-selector");
  const contentEl = document.getElementById("feedback-selection");
  const textarea = document.getElementById("feedback-description");
  const submitBtn = document.getElementById("feedback-submit");
  const titleEl = document.querySelector(".feedback-panel__title");

  if (selectorEl) selectorEl.textContent = pickedSelector;
  if (contentEl) contentEl.textContent = pickedContent || "(空元素)";
  if (contentEl) contentEl.classList.remove("feedback-panel__hint");
  if (submitBtn) submitBtn.disabled = false;
  if (titleEl) titleEl.textContent = "Call Your Claude";

  exitPickerMode();
  highlightContainer(el);

  // auto-focus textarea
  if (textarea) textarea.focus();
}

function updatePanelSide(mouseX) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const side = mouseX < window.innerWidth / 2 ? "right" : "left";
  panel.classList.remove("feedback-panel--left", "feedback-panel--right");
  panel.classList.add(`feedback-panel--${side}`);
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
  return "left"; // default: panel on left
}

function createPanel({ selection, selector, mode }) {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = `feedback-panel feedback-panel--${getPanelSide()}`;

  const isPicker = mode === "picker";
  const selDisplay = isPicker ? "请点击页面中的目标元素..." : escapeHtml(selection || "");
  const selDisplayClass = isPicker ? "feedback-panel__hint" : "";

  panel.innerHTML = `
    <div class="feedback-panel__header-right">
      <span class="feedback-panel__shortcut">Esc</span>
      <button class="feedback-panel__close" id="feedback-close">&times;</button>
    </div>
    <div class="feedback-panel__inner">
      <h2 class="feedback-panel__title">${isPicker ? "选择目标元素" : "Call Your Claude"}</h2>
      <div class="feedback-panel__field">
        <label>页面链接</label>
        <div class="feedback-panel__url">${escapeHtml(location.href)}</div>
      </div>
      <div class="feedback-panel__field">
        <label>选中元素 <span class="feedback-panel__shortcut">${isMac() ? "⌘/" : "Ctrl+/"}</span></label>
        <div class="feedback-panel__selector" id="feedback-selector">${escapeHtml(selector || (isPicker ? "-" : "-"))}</div>
      </div>
      <div class="feedback-panel__field">
        <label>选中内容</label>
        <div class="feedback-panel__selection ${selDisplayClass}" id="feedback-selection">${isPicker ? "请点击页面中的目标元素..." : escapeHtml(selection || "")}</div>
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
        <button class="feedback-panel__btn feedback-panel__btn--submit" id="feedback-submit" ${isPicker ? "disabled" : ""}>发给 Claude Code</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  document.addEventListener("keydown", onPanelEsc);

  if (!isPicker && selector) {
    highlightContainer(getSelectionContainer());
  }

  requestAnimationFrame(() => panel.classList.add("feedback-panel--open"));

  panel.querySelector("#feedback-close").addEventListener("click", () => {
    exitPickerMode();
    closePanel();
  });
  panel.querySelector("#feedback-submit").addEventListener("click", () => {
    const sel = isPicker ? pickedContent : selection;
    const selSelector = isPicker ? pickedSelector : selector;
    submitFeedback(sel, selSelector);
  });

  // Enter to submit (Shift+Enter for newline)
  panel.querySelector("#feedback-description").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const sel = isPicker ? pickedContent : selection;
      const selSelector = isPicker ? pickedSelector : selector;
      submitFeedback(sel, selSelector);
    }
  });
}

function onPanelEsc(e) {
  if (e.key === "Escape") {
    exitPickerMode();
    closePanel();
  }
}

function closePanel() {
  unhighlightContainer();
  exitPickerMode();
  document.removeEventListener("keydown", onPanelEsc);
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.classList.remove("feedback-panel--open");
  setTimeout(() => panel.remove(), 300);
}

async function submitFeedback(selection, selector) {
  const description = document.getElementById("feedback-description").value.trim();
  if (!description) {
    showToast("请填写问题描述");
    return;
  }
  if (selection === "请点击页面中的目标元素...") {
    showToast("请先选择目标内容");
    return;
  }

  const submitBtn = document.getElementById("feedback-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "发送中...";

  closePanel();

  try {
    const result = await chrome.runtime.sendMessage({
      type: "submit_feedback",
      data: {
        pageUrl: location.href,
        pageTitle: document.title,
        selector,
        selection,
        description,
        timestamp: new Date().toISOString(),
      },
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

function isMac() {
  return /Mac/i.test(navigator.platform);
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
  createPanel({ selection: text, selector, mode: "selection" });
}

function openFromPicker() {
  createPanel({ selection: null, selector: null, mode: "picker" });
  enterPickerMode();
}

// keyboard shortcuts: Cmd+/ or Cmd+\ (also works with Ctrl on Windows)
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "\\")) {
    e.preventDefault();
    openFromPicker();
  }
});

// context menu message from background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_FEEDBACK") {
    openFromSelection(msg.selection);
  }
});
