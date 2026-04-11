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

function handleMouse(event: MouseEvent) {
  const { viewH } = getViewDimensions(session.screen, session.editor.lines.length, session.plugin);

  if (event.type === "click") {
    const gw = gutterWidth(session.editor.lines.length);
    const contentTop = 1;
    const editorY = event.y - contentTop + session.cm.scrollY;
    const editorX = event.x - 1 - gw + session.cm.scrollX;

    if (event.y >= contentTop && event.y < contentTop + viewH && event.x > gw) {
      session.cm.clearExtras();
      session.cm.primary.anchor = null;
      session.cm.primary.y = Math.min(editorY, session.editor.lines.length - 1);
      session.cm.primary.x = Math.min(
        Math.max(0, editorX),
        session.editor.lines[session.cm.primary.y].length,
      );
      update();
    }
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
