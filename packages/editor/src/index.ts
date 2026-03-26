#!/usr/bin/env node
import { createScreen, createDraw, showDialog, showSearch } from "@jano/ui";
import { createEditor, save } from "./editor.ts";
import { createCursorManager } from "./cursor-manager.ts";
import { createUndoManager } from "./undo.ts";
import { parseKey } from "./keypress.ts";
import { handleKey } from "./input.ts";
import { render, getViewDimensions } from "./render.ts";
import { initPlugins, detectLanguage, getLoadedPlugins } from "./plugins/index.ts";
import { getPaths } from "./plugins/config.ts";
import type { LanguagePlugin } from "./plugins/types.ts";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: jano <file>");
  process.exit(1);
}

const screen = createScreen();
const draw = createDraw(screen);
const editor = createEditor(filePath);
const cm = createCursorManager();
const undo = createUndoManager();

let plugin: LanguagePlugin | null = null;
let pluginVersion: string | undefined;
let dialogOpen = false;

function update() {
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length);
  cm.ensureVisible(viewW, viewH);
  render(screen, draw, editor, cm, plugin, pluginVersion);
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
      message: `Save changes to "${editor.filePath}" before closing?`,
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
      save(editor);
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

// init
async function start() {
  const paths = getPaths();
  console.log(`[jano] config: ${paths.config}`);
  console.log(`[jano] plugins: ${paths.plugins}`);

  const loadResult = await initPlugins();

  console.log(`[jano] loaded ${loadResult.plugins.length} plugin(s)`);
  for (const p of loadResult.plugins) {
    console.log(
      `[jano]   ✓ ${p.manifest.name} v${p.manifest.version} (${p.manifest.extensions.join(", ")})`,
    );
  }
  for (const err of loadResult.errors) {
    console.log(`[jano]   ✗ ${err.dir}: ${err.error}`);
  }
  for (const conflict of loadResult.conflicts) {
    console.log(`[jano]   ⚠ ${conflict}`);
  }

  plugin = detectLanguage(filePath);
  if (plugin) {
    const loaded = getLoadedPlugins().find((p) => p.plugin === plugin);
    pluginVersion = loaded?.manifest.version;
    console.log(`[jano] language: ${plugin.name}`);
  }

  screen.enter();
  process.stdin.setRawMode(true);
  update();
}

void start();

process.stdin.on("data", (data) => {
  if (dialogOpen) return;

  const key = parseKey(data);
  const result = handleKey(key, editor, cm, screen, undo, plugin);

  switch (result) {
    case "exit":
      void confirmExit();
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
  }

  update();
});

process.stdout.on("resize", update);
