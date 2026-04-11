#!/usr/bin/env node
import { createScreen, createDraw } from "@jano-editor/ui";
import { createEditor } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { parseKey, parseMouse, type KeyEvent, type MouseEvent } from "./keypress.ts";
import { handleKey, type HandleKeyResult } from "./input.ts";
import { render, getViewDimensions, gutterWidth } from "./render.ts";
import { initPlugins, detectLanguage, getLoadedPlugins } from "./plugins/index.ts";
import { getPaths } from "./plugins/config.ts";
import { createValidator } from "./validator.ts";
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
const editor = createEditor(filePath);
const cm = createCursorManager();
const undo = createUndoManager();

const session: Session = {
  screen,
  draw,
  editor,
  cm,
  undo,
  validator: createValidator(null),
  plugin: null,
  pluginVersion: undefined,
  dialogOpen: false,
  update,
  reloadPlugin,
};

// render only — no cursor clamping, no validation. Used by mouse scroll and validator refresh.
function renderView() {
  render(
    session.screen,
    session.draw,
    session.editor,
    session.cm,
    session.plugin,
    session.pluginVersion,
    session.validator.state.diagnostics,
  );
}

// full update: clamp cursor into viewport, render, schedule validation
function update() {
  const { viewW, viewH } = getViewDimensions(
    session.screen,
    session.editor.lines.length,
    session.plugin,
  );
  session.cm.ensureVisible(viewW, viewH);
  renderView();
  session.validator.schedule(session.editor.lines);
}

function reloadPlugin() {
  session.plugin = detectLanguage(session.editor.filePath);
  if (session.plugin) {
    const loaded = getLoadedPlugins().find((p) => p.plugin === session.plugin);
    session.pluginVersion = loaded?.manifest.version;
  } else {
    session.pluginVersion = undefined;
  }
  session.validator = createValidator(session.plugin, () => {
    if (!session.dialogOpen) renderView();
  });
}

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
    if (session.plugin) {
      log(`[jano] language: ${session.plugin.name}`);
    }
  }

  session.screen.enter();
  process.stdin.setRawMode(true);
  update();
}

void start();

let pasteBuffer: string | null = null;

function dispatch(key: KeyEvent) {
  stopAutoScroll();
  const result = handleKey(
    key,
    session.editor,
    session.cm,
    session.screen,
    session.undo,
    session.plugin,
  );
  if (result !== "continue") handleResult(result);
  else update();
}

function makePasteKey(text: string): KeyEvent {
  return {
    name: "bracketedPaste",
    ctrl: false,
    shift: false,
    alt: false,
    raw: Buffer.from(text, "utf8"),
  };
}

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

function handleMouse(event: MouseEvent) {
  const { viewH } = getViewDimensions(session.screen, session.editor.lines.length, session.plugin);

  if (event.type === "click") {
    stopAutoScroll();
    const gw = gutterWidth(session.editor.lines.length);
    const contentTop = 1;
    const editorY = Math.min(
      event.y - contentTop + session.cm.scrollY,
      session.editor.lines.length - 1,
    );
    const editorX = Math.min(
      Math.max(0, event.x - 1 - gw + session.cm.scrollX),
      session.editor.lines[editorY]?.length ?? 0,
    );

    if (event.y < contentTop || event.y >= contentTop + viewH || event.x <= gw) return;

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

    const p = session.cm.primary;
    session.cm.clearExtras();

    if (clickCount === 3) {
      // triple-click: select entire line
      p.y = editorY;
      p.anchor = { x: 0, y: editorY };
      p.x = session.editor.lines[editorY].length;
      clickCount = 0;
    } else if (clickCount === 2) {
      // double-click: select word
      const line = session.editor.lines[editorY];
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
      // single click: position cursor
      p.anchor = null;
      p.y = editorY;
      p.x = editorX;
    }

    update();
    return;
  }

  if (event.type === "drag") {
    const gw = gutterWidth(session.editor.lines.length);
    const contentTop = 1;
    const maxLine = session.editor.lines.length - 1;

    const atTop = event.y < contentTop;
    const atBottom = event.y >= contentTop + viewH;
    const atLeft = event.x <= gw;
    const atRight = event.x >= session.screen.width - 1;

    // update auto-scroll direction
    autoScrollDY = atTop ? -1 : atBottom ? 1 : 0;
    autoScrollDX = atLeft ? -1 : atRight ? 1 : 0;

    if (autoScrollDY !== 0 || autoScrollDX !== 0) {
      // start auto-scroll if not already running
      if (!autoScrollTimer) {
        autoScrollTimer = setInterval(() => {
          const maxSY = Math.max(0, session.editor.lines.length - viewH);
          if (autoScrollDY < 0) session.cm.scrollY = Math.max(0, session.cm.scrollY - 1);
          if (autoScrollDY > 0) session.cm.scrollY = Math.min(maxSY, session.cm.scrollY + 1);
          if (autoScrollDX < 0) session.cm.scrollX = Math.max(0, session.cm.scrollX - 1);
          if (autoScrollDX > 0) session.cm.scrollX += 1;
          // move cursor with the scroll
          const p = session.cm.primary;
          if (autoScrollDY !== 0) {
            p.y = Math.min(Math.max(0, p.y + autoScrollDY), maxLine);
          }
          if (autoScrollDX !== 0) {
            p.x += autoScrollDX;
          }
          p.x = Math.min(Math.max(0, p.x), session.editor.lines[p.y]?.length ?? 0);
          renderView();
        }, 50);
      }
      // safety: stop if no drag events for 2s (mouse left terminal)
    } else {
      // back in content area → stop auto-scroll
      stopAutoScroll();
    }

    // always update cursor to current mouse position
    const editorY = Math.min(Math.max(0, event.y - contentTop + session.cm.scrollY), maxLine);
    const editorX = Math.min(
      Math.max(0, event.x - 1 - gw + session.cm.scrollX),
      session.editor.lines[editorY]?.length ?? 0,
    );

    const p = session.cm.primary;
    if (!p.anchor) p.anchor = { x: p.x, y: p.y };
    p.y = editorY;
    p.x = editorX;
    renderView();
    return;
  }

  const maxScrollY = Math.max(0, session.editor.lines.length - viewH);

  switch (event.type) {
    case "scroll-up":
      session.cm.scrollY = Math.max(0, session.cm.scrollY - 3);
      break;
    case "scroll-down":
      session.cm.scrollY = Math.min(maxScrollY, session.cm.scrollY + 3);
      break;
    case "scroll-left":
      session.cm.scrollX = Math.max(0, session.cm.scrollX - 3);
      break;
    case "scroll-right":
      session.cm.scrollX += 3;
      break;
  }
  renderView();
}

process.stdin.on("data", (data) => {
  if (session.dialogOpen) return;

  // focus in/out (ESC [ I / ESC [ O) — stop auto-scroll on focus loss
  if (
    data[0] === 0x1b &&
    data[1] === 0x5b &&
    (data[2] === 0x49 || data[2] === 0x4f) &&
    data.length === 3
  ) {
    stopAutoScroll();
    return;
  }

  // mouse events (SGR: ESC [ <, X10: ESC [ M)
  const mouse =
    data[0] === 0x1b && data[1] === 0x5b && (data[2] === 0x3c || data[2] === 0x4d)
      ? parseMouse(data)
      : null;
  if (mouse) {
    handleMouse(mouse);
    return;
  }

  const str = data.toString("utf8");

  // bracketed paste: buffer chunks between ESC[200~ and ESC[201~
  if (pasteBuffer !== null) {
    const endIdx = str.indexOf("\x1b[201~");
    if (endIdx === -1) {
      pasteBuffer += str;
      return;
    }
    pasteBuffer += str.slice(0, endIdx);
    const text = pasteBuffer;
    pasteBuffer = null;
    return dispatch(makePasteKey(text));
  }
  if (str.startsWith("\x1b[200~")) {
    const content = str.slice(6);
    const endIdx = content.indexOf("\x1b[201~");
    if (endIdx === -1) {
      pasteBuffer = content;
      return;
    }
    return dispatch(makePasteKey(content.slice(0, endIdx)));
  }

  dispatch(parseKey(data));
});

function handleResult(result: HandleKeyResult) {
  switch (result) {
    case "exit":
      void confirmExit(session);
      return;
    case "help":
      void showHelp(session);
      return;
    case "history":
      void showHistory(session);
      return;
    case "search":
      void openSearch(session);
      return;
    case "goto":
      void openGoto(session);
      return;
    case "diagnostics":
      void showDiagnostics(session);
      return;
    case "settings":
      void showSettings(session);
      return;
    case "save":
      if (session.editor.filePath) {
        void trySave(session, session.editor.filePath).then(() => update());
      } else {
        void saveWithDialog(session);
      }
      return;
    default:
      update();
  }
}

process.stdout.on("resize", () => update());
