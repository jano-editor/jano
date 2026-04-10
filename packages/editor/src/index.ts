#!/usr/bin/env node
import { createScreen, createDraw } from "@jano-editor/ui";
import { createEditor } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { parseKey, type KeyEvent } from "./keypress.ts";
import { handleKey, type HandleKeyResult } from "./input.ts";
import { render, getViewDimensions } from "./render.ts";
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

function update() {
  const { viewW, viewH } = getViewDimensions(
    session.screen,
    session.editor.lines.length,
    session.plugin,
  );
  session.cm.ensureVisible(viewW, viewH);
  render(
    session.screen,
    session.draw,
    session.editor,
    session.cm,
    session.plugin,
    session.pluginVersion,
    session.validator.state.diagnostics,
  );
  // validator decides internally if content changed — debounced, no re-render loop
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
    if (!session.dialogOpen) update();
  });
}

const debug = !!process.env.JANO_DEBUG;
function log(msg: string) {
  if (debug) console.log(msg);
}

// init
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

process.stdin.on("data", (data) => {
  if (session.dialogOpen) return;

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
    const content = str.slice(6); // "\x1b[200~".length === 6
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
