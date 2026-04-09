#!/usr/bin/env node
import {
  createScreen,
  createDraw,
  showDialog,
  showSearch,
  drawList,
  listMoveUp,
  listMoveDown,
} from "@jano-editor/ui";
import { createEditor, saveAs } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { parseKey, type KeyEvent } from "./keypress.ts";
import { handleKey, type HandleKeyResult } from "./input.ts";
import { render, getViewDimensions } from "./render.ts";
import { initPlugins, detectLanguage, getLoadedPlugins } from "./plugins/index.ts";
import { getPaths } from "./plugins/config.ts";
import { CLI_COMMANDS } from "./cli.ts";
import type { LanguagePlugin } from "./plugins/types.ts";
import { createValidator } from "./validator.ts";

const filePath = process.argv[2] || undefined;

const screen = createScreen();
const draw = createDraw(screen);
const editor = createEditor(filePath);
const cm = createCursorManager();
const undo = createUndoManager();

let plugin: LanguagePlugin | null = null;
let pluginVersion: string | undefined;
let dialogOpen = false;
let validator = createValidator(null);

function update() {
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length);
  cm.ensureVisible(viewW, viewH);
  render(screen, draw, editor, cm, plugin, pluginVersion, validator.state.diagnostics);
  // validator decides internally if content changed — debounced, no re-render loop
  validator.schedule(editor.lines);
}

function reloadPlugin() {
  plugin = detectLanguage(editor.filePath);
  if (plugin) {
    const loaded = getLoadedPlugins().find((p) => p.plugin === plugin);
    pluginVersion = loaded?.manifest.version;
  } else {
    pluginVersion = undefined;
  }
  validator = createValidator(plugin);
}

async function trySave(filePath: string) {
  // check if file exists → overwrite warning
  const { existsSync } = await import("node:fs");
  if (existsSync(filePath) && filePath !== editor.filePath) {
    dialogOpen = true;
    const confirm = await showDialog(
      screen,
      draw,
      {
        title: "Overwrite?",
        message: `"${filePath}" already exists. Overwrite?`,
        buttons: [
          { label: "Overwrite", value: "yes" },
          { label: "Cancel", value: "no" },
        ],
        border: "round",
      },
      update,
    );
    dialogOpen = false;
    if (confirm.type !== "button" || confirm.value !== "yes") return false;
  }

  try {
    saveAs(editor, filePath);
    reloadPlugin();
    return true;
  } catch (err) {
    dialogOpen = true;
    await showDialog(
      screen,
      draw,
      {
        title: "Error",
        message: `Could not save: ${err instanceof Error ? err.message : String(err)}`,
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      update,
    );
    dialogOpen = false;
    return false;
  }
}

async function saveWithDialog() {
  dialogOpen = true;

  const result = await showDialog(
    screen,
    draw,
    {
      title: "Save As",
      message: "Enter file name:",
      input: true,
      inputPlaceholder: "filename.ext",
      buttons: [
        { label: "Save", value: "save" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
      width: 50,
    },
    update,
  );

  dialogOpen = false;

  let targetPath = "";
  if (result.type === "button" && result.value === "save" && result.inputValue) {
    targetPath = result.inputValue;
  } else if (result.type === "input" && result.value) {
    targetPath = result.value;
  }

  if (targetPath) {
    await trySave(targetPath);
  }

  update();
}

async function confirmExit() {
  if (!editor.dirty) {
    screen.leave();
    process.exit(0);
  }

  dialogOpen = true;

  const result = await showDialog(
    screen,
    draw,
    {
      title: "Unsaved Changes",
      message: `Save changes to "${editor.filePath || "untitled"}" before closing?`,
      buttons: [
        { label: "Save", value: "save" },
        { label: "Discard", value: "discard" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
    },
    update,
  );

  dialogOpen = false;

  if (result.type === "button") {
    if (result.value === "save") {
      if (!editor.filePath) {
        await saveWithDialog();
        if (!editor.filePath) {
          update();
          return;
        }
      } else {
        const ok = await trySave(editor.filePath);
        if (!ok) {
          update();
          return;
        }
      }
      screen.leave();
      process.exit(0);
    }
    if (result.value === "discard") {
      screen.leave();
      process.exit(0);
    }
  }

  update();
}

async function showHistory() {
  const history = undo.getHistory();

  if (history.length === 0) {
    dialogOpen = true;
    await showDialog(
      screen,
      draw,
      {
        title: "History",
        message: "No changes recorded yet.",
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      update,
    );
    dialogOpen = false;
    update();
    return;
  }

  dialogOpen = true;

  const items: string[] = ["  0. Original file"];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const desc = undo.describeEntry(entry);
    const marker = i === history.length - 1 ? "▸" : " ";
    items.push(`${marker} ${i + 1}. [${time}] ${desc}`);
  }

  const result = await showDialog(
    screen,
    draw,
    {
      title: `History (${history.length} changes)`,
      message: items.slice(-15).join("\n"),
      input: true,
      inputPlaceholder: "Number (0 = original)...",
      buttons: [
        { label: "Jump", value: "jump" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
      width: 60,
    },
    update,
  );

  dialogOpen = false;

  if (result.type === "input" || (result.type === "button" && result.value === "jump")) {
    const inputVal = result.type === "input" ? result.value : (result.inputValue ?? "");
    const idx = parseInt(inputVal, 10);

    if (idx === 0) {
      while (true) {
        const undone = undo.undo(editor.lines, cm.primary);
        if (!undone) break;
        editor.lines = undone.lines;
        if (undone.cursorState) cm.restoreState(undone.cursorState);
      }
      editor.dirty = false;
    } else if (idx >= 1 && idx <= history.length) {
      editor.lines = undo.jumpTo(idx - 1, editor.lines, cm.primary);
      editor.dirty = true;
    }
  }

  update();
}

let lastSearchQuery = "";
let lastReplaceText = "";
let lastSelectedIndex: number | undefined;

async function openSearch() {
  dialogOpen = true;

  const result = await showSearch(
    screen,
    draw,
    editor.lines,
    {
      initialQuery: lastSearchQuery,
      initialReplace: lastReplaceText,
      cursorLine: cm.primary.y,
      cursorCol: cm.primary.x,
      lastSelectedIndex,
      border: "round",
    },
    update,
  );

  dialogOpen = false;
  lastSearchQuery = result.query;
  lastSelectedIndex = result.selectedIndex;
  // only remember replace text if user actually replaced something
  if (result.type === "replace" || result.type === "replaceAll") {
    lastReplaceText = result.replacement;
  } else {
    lastReplaceText = "";
  }

  const p = cm.primary;
  cm.clearExtras();

  if (result.type === "jump") {
    p.y = result.match.line;
    p.x = result.match.col;
    p.anchor = null;
  }

  if (result.type === "replace") {
    // replace single match
    undo.snapshot("replace", { x: p.x, y: p.y }, editor.lines, cm.saveState());
    const m = result.match;
    const line = editor.lines[m.line];
    editor.lines[m.line] =
      line.substring(0, m.col) + result.replacement + line.substring(m.col + m.length);
    editor.dirty = true;
    p.y = m.line;
    p.x = m.col + result.replacement.length;
    p.anchor = null;
    undo.commit({ x: p.x, y: p.y }, editor.lines, cm.saveState());

    // reopen search to continue replacing
    update();
    void openSearch();
    return;
  }

  if (result.type === "replaceAll") {
    undo.snapshot("replace-all", { x: p.x, y: p.y }, editor.lines, cm.saveState());
    // apply replacements bottom-up to preserve positions
    const sorted = [...result.matches].sort((a, b) => b.line - a.line || b.col - a.col);
    for (const m of sorted) {
      const line = editor.lines[m.line];
      editor.lines[m.line] =
        line.substring(0, m.col) + result.replacement + line.substring(m.col + m.length);
    }
    editor.dirty = true;
    undo.commit({ x: p.x, y: p.y }, editor.lines, cm.saveState());
  }

  update();
}

async function openGoto() {
  dialogOpen = true;

  const total = editor.lines.length;
  const current = cm.primary.y + 1;

  const result = await showDialog(
    screen,
    draw,
    {
      title: `Go to Line (1-${total})`,
      message: `Current: line ${current}`,
      input: true,
      inputPlaceholder: "Line number, 'start' or 'end'...",
      buttons: [
        { label: "Start", value: "start" },
        { label: "Go", value: "go" },
        { label: "End", value: "end" },
      ],
      border: "round",
      width: 45,
    },
    update,
  );

  dialogOpen = false;

  const p = cm.primary;
  cm.clearExtras();
  p.anchor = null;

  if (result.type === "button") {
    if (result.value === "start") {
      p.y = 0;
      p.x = 0;
    } else if (result.value === "end") {
      p.y = editor.lines.length - 1;
      p.x = 0;
    } else if (result.value === "go") {
      const inputVal = result.inputValue ?? "";
      const line = parseInt(inputVal, 10);
      if (line >= 1 && line <= editor.lines.length) {
        p.y = line - 1;
        p.x = 0;
      }
    }
  } else if (result.type === "input") {
    const val = result.value.trim().toLowerCase();
    if (val === "start" || val === "s") {
      p.y = 0;
      p.x = 0;
    } else if (val === "end" || val === "e") {
      p.y = editor.lines.length - 1;
      p.x = 0;
    } else {
      const line = parseInt(val, 10);
      if (line >= 1 && line <= editor.lines.length) {
        p.y = line - 1;
        p.x = 0;
      }
    }
  }

  update();
}

async function showHelp() {
  dialogOpen = true;

  const version = process.env.JANO_VERSION || "dev";
  const helpText = [
    `jano v${version}`,
    "",
    "Shortcuts:",
    "  Ctrl+S        Save",
    "  Ctrl+Q        Exit",
    "  Ctrl+Z / Y    Undo / Redo",
    "  Ctrl+X / C / V Cut / Copy / Paste",
    "  Ctrl+A        Select All",
    "  Ctrl+F        Search & Replace",
    "  Ctrl+G        Go to Line",
    "  Ctrl+Shift+↕  Multi-Cursor",
    "  Shift+Arrow   Select",
    "  Ctrl+Arrow    Word Jump",
    "  Alt+↑↓        Move Line",
    "  F1            Help",
    "  F2            History Browser",
    "  F3            Format (plugin)",
    "  F4            Diagnostics",
    "  Esc           Clear Multi-Cursor",
    "",
    "CLI Commands:",
    ...CLI_COMMANDS,
  ].join("\n");

  await showDialog(
    screen,
    draw,
    {
      title: "Help",
      message: helpText,
      buttons: [{ label: "Close", value: "close" }],
      border: "round",
      width: 50,
    },
    update,
  );

  dialogOpen = false;
  update();
}

function showDiagnostics(): Promise<void> {
  const diags = validator.state.diagnostics;

  if (diags.length === 0) {
    dialogOpen = true;
    return showDialog(
      screen,
      draw,
      {
        title: "Diagnostics",
        message: "No issues found.",
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      update,
    ).then(() => {
      dialogOpen = false;
      update();
    });
  }

  dialogOpen = true;

  return new Promise((resolve) => {
    const dialogW = Math.min(65, screen.width - 4);
    const listH = Math.min(18, screen.height - 6);
    let listState = { selectedIndex: 0, scrollOffset: 0 };
    let backgroundDrawn = false;

    const errors = diags.filter((d) => d.severity === "error").length;
    const warnings = diags.filter((d) => d.severity === "warning").length;
    const maxMsg = dialogW - 18;

    const listItems = diags.map((d) => {
      const icon = d.severity === "error" ? "✗" : d.severity === "warning" ? "⚠" : "ℹ";
      const msg = d.message.length > maxMsg ? d.message.substring(0, maxMsg - 1) + "…" : d.message;
      return {
        label: ` ${icon} Ln ${String(d.line + 1).padStart(4)} │ ${msg}`,
        value: `${d.line}`,
      };
    });

    function renderDiag() {
      if (!backgroundDrawn) {
        update();
        backgroundDrawn = true;
      }

      const totalH = 3 + listH + 1;
      const x = Math.floor((screen.width - dialogW) / 2);
      const y = 1;

      draw.rect(x, y, dialogW, totalH, {
        fg: [80, 90, 105] as [number, number, number],
        border: "round",
        fill: [30, 33, 40] as [number, number, number],
      });

      // title + counts
      draw.text(x + Math.floor((dialogW - 15) / 2), y, " Diagnostics ", {
        fg: [230, 200, 100] as [number, number, number],
      });
      const counts: string[] = [];
      if (errors > 0) counts.push(`✗ ${errors}`);
      if (warnings > 0) counts.push(`⚠ ${warnings}`);
      if (counts.length > 0) {
        const countText = ` ${counts.join("  ")} `;
        draw.text(x + dialogW - countText.length - 1, y, countText, {
          fg:
            errors > 0
              ? ([255, 80, 80] as [number, number, number])
              : ([229, 192, 123] as [number, number, number]),
        });
      }

      // hint
      draw.text(x + 2, y + 1, "↑↓ Navigate  Enter Jump  Esc Close", {
        fg: [70, 75, 85] as [number, number, number],
        bg: [30, 33, 40] as [number, number, number],
      });

      // separator
      for (let i = 1; i < dialogW - 1; i++) {
        draw.char(x + i, y + 2, "─", { fg: [80, 90, 105] as [number, number, number] });
      }

      // list
      drawList(draw, {
        x: x + 1,
        y: y + 3,
        width: dialogW - 2,
        height: listH,
        items: listItems,
        selectedIndex: listState.selectedIndex,
        scrollOffset: listState.scrollOffset,
        bg: [30, 33, 40] as [number, number, number],
      });

      screen.hideCursor();
      draw.flush();
    }

    function onData(data: Buffer) {
      if (data[0] === 0x1b && data.length === 1) {
        cleanup();
        dialogOpen = false;
        update();
        resolve();
        return;
      }

      if (data[0] === 13 && diags.length > 0) {
        cleanup();
        dialogOpen = false;
        const d = diags[listState.selectedIndex];
        cm.primary.y = d.line;
        cm.primary.x = d.col;
        cm.primary.anchor = null;
        cm.clearExtras();
        update();
        resolve();
        return;
      }

      if (data[0] === 0x1b && data[1] === 0x5b) {
        const seq = data.toString("utf8", 2);
        if (seq === "A" && diags.length > 0) {
          listState = listMoveUp(listState, diags.length);
          renderDiag();
        }
        if (seq === "B" && diags.length > 0) {
          listState = listMoveDown(listState, diags.length, listH);
          renderDiag();
        }
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
    }

    process.stdin.on("data", onData);
    renderDiag();
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
    plugin = detectLanguage(filePath);
    if (plugin) {
      const loaded = getLoadedPlugins().find((p) => p.plugin === plugin);
      pluginVersion = loaded?.manifest.version;
      log(`[jano] language: ${plugin.name}`);
      validator = createValidator(plugin, () => {
        if (!dialogOpen) update();
      });
    }
  }

  screen.enter();
  process.stdin.setRawMode(true);
  update();
}

void start();

let pasteBuffer: string | null = null;

function dispatch(key: KeyEvent) {
  const result = handleKey(key, editor, cm, screen, undo, plugin);
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
  if (dialogOpen) return;

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
      void confirmExit();
      return;
    case "help":
      void showHelp();
      return;
    case "history":
      void showHistory();
      return;
    case "search":
      void openSearch();
      return;
    case "goto":
      void openGoto();
      return;
    case "diagnostics":
      void showDiagnostics();
      return;
    case "save":
      if (editor.filePath) {
        void trySave(editor.filePath).then(() => update());
      } else {
        void saveWithDialog();
      }
      return;
    default:
      update();
  }
}

process.stdout.on("resize", () => update());
