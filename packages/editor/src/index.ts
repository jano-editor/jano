#!/usr/bin/env node
import {
  createScreen,
  createDraw,
  createInputManager,
  drawPopup,
  popupMoveUp,
  popupMoveDown,
  createAlert,
  drawAlert,
  alertHandleKey,
  alertHandleClick,
  closeAlert,
  createReveal,
  isRevealDone,
  revealFrame,
  type RevealState,
  type KeyEvent,
  type MouseEvent,
  type AlertState,
} from "@jano-editor/ui";
import { checkIfUpdateAvailable } from "./utils/version-check.ts";
import { initDebugLogger, log, getLogFilePath } from "./utils/logger.ts";
import { installCrashGuard } from "./utils/crash-guard.ts";
import { createEditor } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { handleKey, type HandleKeyResult } from "./input.ts";
import {
  render,
  getViewDimensions,
  gutterWidth,
  positionCursor,
  renderTitleReveal,
  TITLE_FG,
  JANO_PINK,
} from "./render.ts";
import {
  createCompletionState,
  closeCompletion,
  filterCompletions,
  triggerCompletion,
  applyCompletionAtCursors,
} from "./completion.ts";
import { buildContext } from "./plugins/context.ts";
import { callPluginHookAsync } from "./plugins/call.ts";
import { initPlugins, detectLanguage, getLoadedPlugins } from "./plugins/index.ts";
import { getPaths, getBackupsDir } from "./plugins/config.ts";
import { fetchPluginList, type RegistryPlugin } from "./plugins/registry.ts";
import { pickRecommendations } from "./plugins/recommendations.ts";
import { showPluginWelcome } from "./dialogs/welcome.ts";
import { createBackupManager, listOrphanedBackups } from "./backup.ts";
import { createValidator } from "./validator.ts";
import { getEditorSettings } from "./settings.ts";
import { getGitInfo, type GitInfo } from "./git.ts";
import { colAt, idxAtCol, WORD_CHAR, NON_WORD_CHAR } from "./text-layout.ts";
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
  showRecovery,
} from "./dialogs/index.ts";

const filePath = process.env.JANO_FILE || undefined;

const screen = createScreen();
const draw = createDraw(screen);
const input = createInputManager();
const editor = createEditor(filePath);
const cm = createCursorManager();
const undo = createUndoManager();
const comp = createCompletionState();
const backup = createBackupManager(getBackupsDir());
let gitInfo: GitInfo | null = null;

const session: Session = {
  screen,
  draw,
  input,
  editor,
  cm,
  undo,
  validator: createValidator(null),
  backup,
  plugin: null,
  pluginVersion: undefined,
  update,
  reloadPlugin,
  fileOpened,
};

// ----- Rendering -----

let activeAlert: AlertState | null = null;
let recoveryAlert: AlertState | null = null;
let titleReveal: RevealState | null = null;
let pluginErrors: string[] = [];
// set on the first key press, so the plugin welcome never pops up mid typing
let userTyped = false;

function renderView() {
  render(
    screen,
    draw,
    editor,
    cm,
    session.plugin,
    session.pluginVersion,
    session.validator.state.diagnostics,
    gitInfo,
    titleReveal,
  );
  renderCompletionPopup();
  for (const alert of [activeAlert, recoveryAlert]) {
    if (alert && !alert.closed) {
      drawAlert(screen, draw, alert);
      draw.flush();
    }
  }
  // open dialogs paint on top, so timers, banners and async results can redraw the
  // screen at any time without hiding them. a dialog also owns the terminal cursor.
  const dialogOpen = input.renderLayers();
  // must be the LAST step of the render cycle: every preceding flush can move
  // the terminal cursor to the last written cell, which would hide the blink.
  if (!dialogOpen) positionCursor(screen, editor, cm, session.plugin);
}

const KIND_ICONS: Record<string, string> = {
  keyword: "◆",
  function: "ƒ",
  variable: "χ",
  property: "◇",
  type: "◈",
  constant: "●",
  snippet: "✦",
  text: "≡",
};

function kindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? kind.charAt(0);
}

// screen x of a mouse event to the string index under it on line y
function mouseToIndex(screenX: number, y: number, gw: number): number {
  const col = Math.max(0, screenX - 1 - gw + cm.scrollX);
  return idxAtCol(editor.lines[y] ?? "", col, getEditorSettings().tabSize);
}

function renderCompletionPopup() {
  if (!comp.active || comp.filtered.length === 0) return;
  const gw = gutterWidth(editor.lines.length);
  const p = cm.primary;
  const col = colAt(editor.lines[p.y], p.x, getEditorSettings().tabSize);
  drawPopup(draw, {
    x: 1 + gw + (col - cm.scrollX),
    y: 1 + (p.y - cm.scrollY),
    screenW: screen.width,
    screenH: screen.height,
    items: comp.filtered.map((c) => ({
      label: c.label,
      detail: c.kind ? kindIcon(c.kind) : undefined,
    })),
    selectedIndex: comp.selectedIndex,
    scrollOffset: comp.scrollOffset,
  });
  draw.flush();
}

function update() {
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  cm.ensureVisible(viewW, viewH, editor.lines, getEditorSettings().tabSize);
  renderView();
  session.validator.schedule(editor.lines);
  backup.schedule(editor);
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
  refreshGitInfo();
}

const OPEN_HOOK_TIMEOUT_MS = 5000;

// onOpen is fire and forget, it may be async (api 2) but nothing waits for it
function fileOpened() {
  const plugin = session.plugin;
  if (!plugin?.onOpen) return;
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length, plugin);
  const ctx = buildContext(editor, cm, {
    firstLine: cm.scrollY,
    lastLine: cm.scrollY + viewH,
    width: viewW,
    height: viewH,
  });
  void callPluginHookAsync(plugin, "onOpen", () => plugin.onOpen!(ctx), OPEN_HOOK_TIMEOUT_MS);
}

function refreshGitInfo() {
  void getGitInfo(editor.filePath).then((info) => {
    gitInfo = info;
    update();
  });
}

// ----- Plugin load errors -----

// broken plugins used to fail silently, the details live in `jano plugin list`
function showPluginErrors() {
  if (pluginErrors.length === 0) return;
  const what =
    pluginErrors.length === 1 ? `Plugin ${pluginErrors[0]}` : `${pluginErrors.length} plugins`;
  activeAlert = createAlert(
    {
      type: "error",
      position: "top",
      message: `${what} failed to load, see 'jano plugin list'`,
      autoClose: 10000,
    },
    () => {
      activeAlert = null;
      update();
    },
  );
}

// ----- Plugin recommendations -----

/** Offers missing registry plugins on startup. Skipped offline, mid typing or over a dialog. */
async function offerPlugins() {
  if (!getEditorSettings().pluginRecommendations) return;
  let available: RegistryPlugin[];
  try {
    available = await fetchPluginList();
  } catch (err) {
    log.info({ action: "plugin_welcome_skipped", reason: "offline", error: String(err) });
    return;
  }
  const missing = pickRecommendations(available);
  const busy = userTyped || input.topLayerName() !== "editor";
  if (missing.length === 0 || busy) {
    log.info({
      action: "plugin_welcome_skipped",
      reason: missing.length === 0 ? "nothing_new" : "busy",
    });
    return;
  }
  await showPluginWelcome(session, missing, reloadAllPlugins);
}

/** Loads freshly installed plugins without a restart, the open file picks up its plugin. */
async function reloadAllPlugins() {
  const result = await initPlugins();
  log.info({ action: "plugins_reloaded", count: result.plugins.length });
  reloadPlugin();
  update();
}

// ----- Startup animation -----

// "jano" is typed into the title out of a pink block cursor. Purely visual: it runs
// on its own timer, redraws only the title row and never blocks input.
function playStartupAnimation() {
  if (!getEditorSettings().startupAnimation) return;
  const reveal = createReveal({
    text: "jano",
    enterColor: JANO_PINK,
    finalColor: TITLE_FG,
    stepMs: 130, // slow enough to see the uppercase letter arrive
    blinkMs: 250,
    blinks: 1,
  });
  titleReveal = reveal;
  log.debug({ action: "startup_animation_start" });

  let lastFrame = -1;
  const timer = setInterval(() => {
    const frame = revealFrame(reveal);
    if (frame === lastFrame) return;
    lastFrame = frame;
    renderTitleReveal(screen, draw, editor, session.plugin, reveal);
    if (isRevealDone(reveal)) {
      clearInterval(timer);
      titleReveal = null;
      log.debug({ action: "startup_animation_done" });
    }
  }, 20);
}

// ----- Recovery -----

function refreshRecoveryBanner() {
  const count = listOrphanedBackups(getBackupsDir()).length;
  if (count === 0) {
    if (recoveryAlert) closeAlert(recoveryAlert);
    return;
  }
  const files = count === 1 ? "1 unsaved file" : `${count} unsaved files`;
  const message = `${files} from a crash. Ctrl+R or click to recover`;
  if (recoveryAlert) {
    recoveryAlert.opts.message = message;
    return;
  }
  log.info({ action: "recovery_found", count });
  recoveryAlert = createAlert(
    {
      type: "warn",
      position: "bottom",
      message,
      onClick: () => void openRecovery(),
    },
    () => {
      recoveryAlert = null;
      update();
    },
  );
}

async function openRecovery() {
  await showRecovery(session);
  refreshRecoveryBanner();
  update();
}

// ----- Completion -----

let autoCompleteTimer: ReturnType<typeof setTimeout> | null = null;

// bumped on every new request and on cancel, so late plugin answers are dropped
let completionRequest = 0;

function cancelAutoComplete() {
  completionRequest++;
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
  while (wordStart > 0 && WORD_CHAR.test(line[wordStart - 1])) wordStart--;
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
  // the popup only opens if nothing changed while a (possibly async) plugin answered
  const request = ++completionRequest;
  const { x, y } = p;
  const lineBefore = editor.lines[y];
  const isCurrent = () =>
    request === completionRequest &&
    cm.primary.x === x &&
    cm.primary.y === y &&
    editor.lines[y] === lineBefore;
  void triggerCompletion(comp, session.plugin, ctx, editor.lines, y, x, isCurrent).then(() => {
    if (isCurrent()) renderView();
  });
}

function acceptCompletion() {
  if (!comp.active) return;
  const item = comp.filtered[comp.selectedIndex];
  if (!item) return;
  const text = item.insertText ?? item.label;
  const p = cm.primary;
  undo.snapshot("complete", { x: p.x, y: p.y }, editor.lines, cm.saveState());
  applyCompletionAtCursors(editor.lines, cm.all, text);
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

  const result = handleKey(key, editor, cm, screen, undo, session.plugin, update);
  if (result !== "continue") {
    cancelAutoComplete();
    closeCompletion(comp);
    handleResult(result);
  } else {
    update();
    if (comp.active) {
      // only keep the popup open when the user is actively typing into the word
      // being completed: a word character, or a backspace that stays within the word.
      const isWordChar = !key.ctrl && !key.alt && key.name.length === 1 && WORD_CHAR.test(key.name);
      const isBackspace = key.name === "backspace";
      const stillInWord = cm.primary.y === comp.startY && cm.primary.x >= comp.startX;

      if (!stillInWord || (!isWordChar && !isBackspace)) {
        closeCompletion(comp);
        renderView();
      } else {
        const line = editor.lines[cm.primary.y] ?? "";
        const prefix = line.substring(comp.startX, cm.primary.x);
        filterCompletions(comp, prefix);
        renderView();
      }
    } else {
      const isTyping =
        (!key.ctrl && !key.alt && key.name.length === 1) ||
        key.name === "backspace" ||
        key.name === "tab";
      // anything else (arrows, home, ...) moved the cursor: a pending completion is stale
      if (isTyping) scheduleAutoComplete();
      else cancelAutoComplete();
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
input.registerShortcut("ctrl+r", "recover");
input.registerShortcut("f1", "help");
input.registerShortcut("f2", "history");
input.registerShortcut("f4", "diagnostics");
input.registerShortcut("f9", "settings");

// ----- Editor Layer: register all event handlers -----

const editorLayer = input.pushLayer("editor");

editorLayer.on("shortcut", (event) => {
  log.info({ action: "shortcut", shortcut: event.action });
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
    case "recover":
      void openRecovery();
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
    default:
      return false; // unknown action — let key event pass through
  }
  return true;
});

editorLayer.on("key", (key) => {
  userTyped = true;
  // alert intercepts ESC; onClose callback clears activeAlert and re-renders
  if (activeAlert && alertHandleKey(activeAlert, key.raw)) {
    return true;
  }
  if (recoveryAlert && alertHandleKey(recoveryAlert, key.raw)) {
    return true;
  }
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

editorLayer.on("mouse:click", (event: MouseEvent) => {
  // alert intercepts click on ✕; onClose callback clears activeAlert and re-renders
  if (activeAlert && alertHandleClick(activeAlert, event.x, event.y)) {
    return true;
  }
  if (recoveryAlert && alertHandleClick(recoveryAlert, event.x, event.y)) {
    return true;
  }
  // clicking anywhere dismisses the completion popup — the user is navigating, not typing
  if (comp.active) {
    cancelAutoComplete();
    closeCompletion(comp);
  }
  stopAutoScroll();
  const { viewH } = getViewDimensions(screen, editor.lines.length, session.plugin);
  const gw = gutterWidth(editor.lines.length);
  const contentTop = 1;
  const editorY = Math.min(event.y - contentTop + cm.scrollY, editor.lines.length - 1);
  const editorX = mouseToIndex(event.x, editorY, gw);

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
      const isWord = WORD_CHAR.test(ch);
      const pattern = isWord ? WORD_CHAR : NON_WORD_CHAR;
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
  const editorX = mouseToIndex(event.x, editorY, gw);
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

async function start() {
  initDebugLogger();
  const paths = getPaths();

  log.info({
    action: "startup",
    version: process.env.JANO_VERSION || "dev",
    configDir: paths.config,
    pluginsDir: paths.plugins,
    logsDir: getLogFilePath(),
    filePath,
  });

  const loadResult = await initPlugins();
  log.info({
    action: "plugins_loaded",
    count: loadResult.plugins.length,
    plugins: loadResult.plugins.map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      extensions: p.manifest.extensions,
    })),
  });
  for (const err of loadResult.errors) {
    log.error({
      action: "plugin_load_failed",
      plugin: err.name,
      dir: err.dir,
      error: err.error,
      why: err.why,
      fix: err.fix,
      link: err.link,
    });
  }
  pluginErrors = loadResult.errors.map((e) => e.name);
  for (const conflict of loadResult.conflicts) {
    log.warn({ action: "plugin_conflict", message: conflict });
  }

  log.info({
    action: "editor_init",
    filePath: filePath || null,
    isNewFile: editor.isNewFile,
    lineCount: editor.lines.length,
    eol: editor.eol === "\r\n" ? "crlf" : "lf",
    bom: editor.bom,
  });

  if (filePath) {
    reloadPlugin();
    fileOpened();
    if (session.plugin) {
      log.info({
        action: "language_detected",
        plugin: session.plugin.name,
        version: session.pluginVersion,
      });
    }
  }

  if (!process.stdin.isTTY) {
    console.error("[jano] Not a terminal. jano requires an interactive TTY.");
    process.exit(1);
  }

  screen.enter();
  installCrashGuard(screen, () => backup.writeNow(editor));
  process.stdin.setRawMode(true);
  input.start();
  refreshRecoveryBanner();
  showPluginErrors();
  void offerPlugins();
  playStartupAnimation();
  update();

  // async git info, renders when ready (already triggered by reloadPlugin for files)
  if (!filePath) refreshGitInfo();

  // async version check - shows a banner if a newer version is available
  void checkIfUpdateAvailable().then((latest) => {
    // don't replace a plugin error, that one matters more
    if (!latest || activeAlert) return;
    const current = process.env.JANO_VERSION || "dev";
    activeAlert = createAlert(
      {
        type: "info",
        message: `jano v${current} → v${latest} available. Run 'jano update' to upgrade.`,
        position: "top",
        autoClose: 10000,
      },
      () => {
        activeAlert = null;
        update();
      },
    );
    update();
  });
}

void start();
