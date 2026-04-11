#!/usr/bin/env node
import {
  createScreen,
  createDraw,
  createInputManager,
  drawPopup,
  popupMoveUp,
  popupMoveDown,
  type KeyEvent,
} from "@jano-editor/ui";
import { createEditor } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { handleKey, type HandleKeyResult } from "./input.ts";
import { render, getViewDimensions, gutterWidth } from "./render.ts";
import {
  createCompletionState,
  closeCompletion,
  filterCompletions,
  triggerCompletion,
} from "./completion.ts";
import { buildContext } from "./plugins/context.ts";
import { initPlugins, detectLanguage, getLoadedPlugins } from "./plugins/index.ts";
import { getPaths } from "./plugins/config.ts";
import { createValidator } from "./validator.ts";
import { getEditorSettings } from "./settings.ts";
import {
  type Session,
  trySave,
  saveWithDialog,
  confirmExit,
  showHistory,
  openSearch,
  openGoto,
  showHelp,
  showSettings,
  showDiagnostics,
} from "./dialogs/index.ts";

const filePath = process.argv[2] || undefined;

const screen = createScreen();
const draw = createDraw(screen);
const input = createInputManager();
const editor = createEditor(filePath);
const cm = createCursorManager();
const undo = createUndoManager();
const comp = createCompletionState();

const session: Session = {
  screen,
  draw,
  input,
  editor,
  cm,
  undo,
  validator: createValidator(null),
  plugin: null,
  pluginVersion: undefined,
  update,
  reloadPlugin,
};

// ----- Rendering -----

function renderView() {
  render(
    screen,
    draw,
    editor,
    cm,
    session.plugin,
    session.pluginVersion,
    session.validator.state.diagnostics,
  );
  renderCompletionPopup();
}

function renderCompletionPopup() {
  if (!comp.active || comp.filtered.length === 0) return;
  const gw = gutterWidth(editor.lines.length);
  const p = cm.primary;
  drawPopup(draw, {
    x: 1 + gw + (p.x - cm.scrollX),
    y: 1 + (p.y - cm.scrollY),
    screenW: screen.width,
    screenH: screen.height,
    items: comp.filtered.map((c) => ({
      label: c.label,
      detail: c.kind ? c.kind.substring(0, 3) : undefined,
    })),
    selectedIndex: comp.selectedIndex,
    scrollOffset: comp.scrollOffset,
  });
  draw.flush();
}

function update() {
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  cm.ensureVisible(viewW, viewH);
  renderView();
  session.validator.schedule(editor.lines);
}

function reloadPlugin() {
  session.plugin = detectLanguage(editor.filePath);
  if (session.plugin) {
    const loaded = getLoadedPlugins().find((p) => p.plugin === session.plugin);
    session.pluginVersion = loaded?.manifest.version;
  } else {
    session.pluginVersion = undefined;
  }
  session.validator = createValidator(session.plugin, () => renderView());
}

// ----- Completion -----

let autoCompleteTimer: ReturnType<typeof setTimeout> | null = null;

function cancelAutoComplete() {
  if (autoCompleteTimer) {
    clearTimeout(autoCompleteTimer);
    autoCompleteTimer = null;
  }
}

function scheduleAutoComplete() {
  cancelAutoComplete();
  if (!getEditorSettings().autoComplete) return;
  const p = cm.primary;
  const line = editor.lines[p.y] ?? "";
  let wordStart = p.x;
  while (wordStart > 0 && /\w/.test(line[wordStart - 1])) wordStart--;
  if (p.x - wordStart < 2) return;
  autoCompleteTimer = setTimeout(() => {
    autoCompleteTimer = null;
    if (!comp.active) openCompletion();
  }, 300);
}

function openCompletion() {
  const p = cm.primary;
  const { viewH, viewW } = getViewDimensions(screen, editor.lines.length, session.plugin);
  const ctx = buildContext(editor, cm, {
    firstLine: cm.scrollY,
    lastLine: cm.scrollY + viewH,
    width: viewW,
    height: viewH,
  });
  triggerCompletion(comp, session.plugin, ctx, editor.lines, p.y, p.x);
  renderView();
}

function acceptCompletion() {
  if (!comp.active) return;
  const item = comp.filtered[comp.selectedIndex];
  if (!item) return;
  const text = item.insertText ?? item.label;
  const p = cm.primary;
  const line = editor.lines[p.y];
  undo.snapshot("complete", { x: p.x, y: p.y }, editor.lines, cm.saveState());
  const before = line.substring(0, comp.startX);
  const after = line.substring(p.x);
  if (text.includes("\n")) {
    const parts = text.split("\n");
    editor.lines[p.y] = before + parts[0];
    for (let i = 1; i < parts.length; i++) {
      editor.lines.splice(p.y + i, 0, parts[i] + (i === parts.length - 1 ? after : ""));
    }
    p.y += parts.length - 1;
    p.x = parts[parts.length - 1].length;
  } else {
    editor.lines[p.y] = before + text + after;
    p.x = comp.startX + text.length;
  }
  editor.dirty = true;
  undo.commit({ x: p.x, y: p.y }, editor.lines, cm.saveState());
  closeCompletion(comp);
  update();
}

// ----- Mouse state -----

let lastClickTime = 0;
let lastClickX = -1;
let lastClickY = -1;
let clickCount = 0;
let autoScrollTimer: ReturnType<typeof setInterval> | null = null;
let autoScrollDY = 0;
let autoScrollDX = 0;

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
  autoScrollDY = 0;
  autoScrollDX = 0;
}

// ----- Key dispatch -----

function dispatch(key: KeyEvent) {
  stopAutoScroll();

  // completion popup intercepts up/down/tab/enter/esc
  if (comp.active) {
    if (key.name === "up") {
      const r = popupMoveUp(comp.selectedIndex, comp.scrollOffset, comp.filtered.length);
      comp.selectedIndex = r.selectedIndex;
      comp.scrollOffset = r.scrollOffset;
      renderView();
      return;
    }
    if (key.name === "down") {
      const r = popupMoveDown(comp.selectedIndex, comp.scrollOffset, comp.filtered.length);
      comp.selectedIndex = r.selectedIndex;
      comp.scrollOffset = r.scrollOffset;
      renderView();
      return;
    }
    if (key.name === "tab" || key.name === "enter") {
      acceptCompletion();
      return;
    }
    if (key.name === "escape" || (key.raw.length === 1 && key.raw[0] === 0x1b)) {
      closeCompletion(comp);
      renderView();
      return;
    }
  }

  const result = handleKey(key, editor, cm, screen, undo, session.plugin);
  if (result !== "continue") {
    cancelAutoComplete();
    closeCompletion(comp);
    handleResult(result);
  } else {
    update();
    if (comp.active) {
      const line = editor.lines[cm.primary.y] ?? "";
      const prefix = line.substring(comp.startX, cm.primary.x);
      if (cm.primary.y !== comp.startY || cm.primary.x < comp.startX) {
        closeCompletion(comp);
        renderView();
      } else {
        filterCompletions(comp, prefix);
        renderView();
      }
    } else {
      const isTyping =
        (!key.ctrl && !key.alt && key.name.length === 1) ||
        key.name === "backspace" ||
        key.name === "tab";
      if (isTyping) scheduleAutoComplete();
    }
  }
}

function handleResult(result: HandleKeyResult) {
  if (result === "complete") {
    openCompletion();
  } else {
    update();
  }
}

// ----- Shortcuts -----

input.registerShortcut("ctrl+s", "save");
input.registerShortcut("ctrl+q", "exit");
input.registerShortcut("ctrl+f", "search");
input.registerShortcut("ctrl+g", "goto");
input.registerShortcut("f1", "help");
input.registerShortcut("f2", "history");
input.registerShortcut("f4", "diagnostics");
input.registerShortcut("f9", "settings");

// ----- Editor Layer: register all event handlers -----

const editorLayer = input.pushLayer("editor");

editorLayer.on("shortcut", (event) => {
  cancelAutoComplete();
  closeCompletion(comp);
  stopAutoScroll();
  switch (event.action) {
    case "save":
      if (editor.filePath) {
        void trySave(session, editor.filePath).then(() => update());
      } else {
        void saveWithDialog(session);
      }
      break;
    case "exit":
      void confirmExit(session);
      break;
    case "search":
      void openSearch(session);
      break;
    case "goto":
      void openGoto(session);
      break;
    case "help":
      void showHelp(session);
      break;
    case "history":
      void showHistory(session);
      break;
    case "diagnostics":
      void showDiagnostics(session);
      break;
    case "settings":
      void showSettings(session);
      break;
  }
  return true;
});

editorLayer.on("key", (key) => {
  dispatch(key);
  return true;
});

editorLayer.on("paste", (event) => {
  dispatch({
    name: "bracketedPaste",
    ctrl: false,
    shift: false,
    alt: false,
    raw: Buffer.from(event.text, "utf8"),
  });
  return true;
});

editorLayer.on("mouse:click", (event) => {
  stopAutoScroll();
  const { viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  const gw = gutterWidth(editor.lines.length);
  const contentTop = 1;
  const editorY = Math.min(event.y - contentTop + cm.scrollY, editor.lines.length - 1);
  const editorX = Math.min(
    Math.max(0, event.x - 1 - gw + cm.scrollX),
    editor.lines[editorY]?.length ?? 0,
  );

  if (event.y < contentTop || event.y >= contentTop + viewH || event.x <= gw) return true;

  const now = Date.now();
  const samePos = lastClickX === editorX && lastClickY === editorY;
  if (now - lastClickTime < 400 && samePos) {
    clickCount++;
  } else {
    clickCount = 1;
  }
  lastClickTime = now;
  lastClickX = editorX;
  lastClickY = editorY;

  const p = cm.primary;
  cm.clearExtras();

  if (clickCount === 3) {
    p.y = editorY;
    p.anchor = { x: 0, y: editorY };
    p.x = editor.lines[editorY].length;
    clickCount = 0;
  } else if (clickCount === 2) {
    const line = editor.lines[editorY];
    const ch = line[editorX];
    if (ch !== undefined) {
      const isWord = /\w/.test(ch);
      const pattern = isWord ? /\w/ : /[^\w\s]/;
      let left = editorX;
      while (left > 0 && pattern.test(line[left - 1])) left--;
      let right = editorX;
      while (right < line.length && pattern.test(line[right])) right++;
      p.y = editorY;
      p.anchor = { x: left, y: editorY };
      p.x = right;
    }
  } else {
    p.anchor = null;
    p.y = editorY;
    p.x = editorX;
  }
  update();
  return true;
});

editorLayer.on("mouse:release", () => {
  stopAutoScroll();
  return true;
});

editorLayer.on("mouse:drag", (event) => {
  const { viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  const gw = gutterWidth(editor.lines.length);
  const contentTop = 1;
  const maxLine = editor.lines.length - 1;

  const atTop = event.y < contentTop;
  const atBottom = event.y >= contentTop + viewH;
  const atLeft = event.x <= gw;
  const atRight = event.x >= screen.width - 1;

  autoScrollDY = atTop ? -1 : atBottom ? 1 : 0;
  autoScrollDX = atLeft ? -1 : atRight ? 1 : 0;

  if (autoScrollDY !== 0 || autoScrollDX !== 0) {
    if (!autoScrollTimer) {
      autoScrollTimer = setInterval(() => {
        const maxSY = Math.max(0, editor.lines.length - viewH);
        if (autoScrollDY < 0) cm.scrollY = Math.max(0, cm.scrollY - 1);
        if (autoScrollDY > 0) cm.scrollY = Math.min(maxSY, cm.scrollY + 1);
        if (autoScrollDX < 0) cm.scrollX = Math.max(0, cm.scrollX - 1);
        if (autoScrollDX > 0) cm.scrollX += 1;
        const p = cm.primary;
        if (autoScrollDY !== 0) p.y = Math.min(Math.max(0, p.y + autoScrollDY), maxLine);
        if (autoScrollDX !== 0) p.x += autoScrollDX;
        p.x = Math.min(Math.max(0, p.x), editor.lines[p.y]?.length ?? 0);
        renderView();
      }, 50);
    }
  } else {
    stopAutoScroll();
  }

  const editorY = Math.min(Math.max(0, event.y - contentTop + cm.scrollY), maxLine);
  const editorX = Math.min(
    Math.max(0, event.x - 1 - gw + cm.scrollX),
    editor.lines[editorY]?.length ?? 0,
  );
  const p = cm.primary;
  if (!p.anchor) p.anchor = { x: p.x, y: p.y };
  p.y = editorY;
  p.x = editorX;
  renderView();
  return true;
});

editorLayer.on("mouse:scroll", (event) => {
  const { viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  const maxScrollY = Math.max(0, editor.lines.length - viewH);
  switch (event.type) {
    case "scroll-up":
      cm.scrollY = Math.max(0, cm.scrollY - 3);
      break;
    case "scroll-down":
      cm.scrollY = Math.min(maxScrollY, cm.scrollY + 3);
      break;
    case "scroll-left":
      cm.scrollX = Math.max(0, cm.scrollX - 3);
      break;
    case "scroll-right":
      cm.scrollX += 3;
      break;
  }
  renderView();
  return true;
});

editorLayer.on("focus:out", () => {
  stopAutoScroll();
  return true;
});

editorLayer.on("resize", () => {
  update();
  return true;
});

// ----- Init -----

const debug = !!process.env.JANO_DEBUG;
function log(msg: string) {
  if (debug) console.log(msg);
}

async function start() {
  const paths = getPaths();
  log(`[jano] v${process.env.JANO_VERSION || "dev"}`);
  log(`[jano] config: ${paths.config}`);
  log(`[jano] plugins: ${paths.plugins}`);

  const loadResult = await initPlugins();
  log(`[jano] loaded ${loadResult.plugins.length} plugin(s)`);
  for (const p of loadResult.plugins) {
    log(
      `[jano]   ✓ ${p.manifest.name} v${p.manifest.version} (${p.manifest.extensions.join(", ")})`,
    );
  }
  for (const err of loadResult.errors) {
    log(`[jano]   ✗ ${err.dir}: ${err.error}`);
  }
  for (const conflict of loadResult.conflicts) {
    log(`[jano]   ⚠ ${conflict}`);
  }

  if (filePath) {
    reloadPlugin();
    if (session.plugin) log(`[jano] language: ${session.plugin.name}`);
  }

  screen.enter();
  process.stdin.setRawMode(true);
  input.start();
  update();
}

void start();
