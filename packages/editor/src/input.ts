import type { Screen } from "@jano-editor/ui";
import type { EditorState } from "./editor.ts";
import type { KeyEvent } from "./keypress.ts";
import type { UndoManager } from "./undo.ts";
import type { LanguagePlugin, ActionType } from "./plugins/types.ts";
import type { CursorManager, SingleCursor } from "./cursor-manager.ts";
import { wordBoundaryLeft, wordBoundaryRight } from "./cursor-manager.ts";
import * as ed from "./editor.ts";
import { buildContext, buildAction } from "./plugins/context.ts";
import { applyEditResult } from "./plugins/apply.ts";
import { getEditorSettings } from "./settings.ts";

// strip control characters except \t (0x09) and \n (0x0a)
function stripControlChars(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code >= 0x20) {
      if (code !== 0x7f) result += text[i];
    }
  }
  return result;
}

// copy to system clipboard (cross-platform)
async function copyToSystemClipboard(text: string) {
  try {
    // WSL: clip.exe mangles UTF-8, use PowerShell instead
    if (process.env["WSL_DISTRO_NAME"]) {
      const { execSync } = await import("node:child_process");
      const escaped = text.replace(/'/g, "''");
      execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`, {
        timeout: 3000,
      });
      return;
    }
    const { default: clipboardy } = await import("clipboardy");
    await clipboardy.write(text);
  } catch {
    // silent fail on headless environments
  }
}

export type HandleKeyResult =
  | "continue"
  | "exit"
  | "history"
  | "search"
  | "goto"
  | "save"
  | "diagnostics"
  | "help"
  | "settings"
  | "complete";

function notifyPlugin(
  plugin: LanguagePlugin | null,
  actionType: ActionType,
  c: SingleCursor,
  prevPos: { x: number; y: number },
  editor: EditorState,
  cm: CursorManager,
  screen: Screen,
  extra?: { char?: string; pastedText?: string; deletedText?: string },
) {
  if (!plugin?.onCursorAction) return;
  const action = buildAction(actionType, c, { line: prevPos.y, col: prevPos.x }, extra);
  const ctx = buildContext(editor, cm, getViewport(cm, screen), action);
  const result = plugin.onCursorAction(ctx);
  if (result) applyEditResult(result, editor, cm, c);
}

function snap(undo: UndoManager, label: string, cm: CursorManager, editor: EditorState) {
  undo.snapshot(label, { x: cm.primary.x, y: cm.primary.y }, editor.lines, cm.saveState());
}

function commit(undo: UndoManager, cm: CursorManager, editor: EditorState) {
  undo.commit({ x: cm.primary.x, y: cm.primary.y }, editor.lines, cm.saveState());
}

function getViewport(cm: CursorManager, screen: Screen) {
  return {
    firstLine: cm.scrollY,
    lastLine: cm.scrollY + screen.height - 5,
    width: screen.width,
    height: screen.height,
  };
}

export function handleKey(
  key: KeyEvent,
  editor: EditorState,
  cm: CursorManager,
  screen: Screen,
  undo: UndoManager,
  plugin: LanguagePlugin | null,
): HandleKeyResult {
  // --- plugin onKeyDown: let plugin intercept keys before editor ---
  if (plugin?.onKeyDown) {
    const keyInfo = { name: key.name, ctrl: !!key.ctrl, alt: !!key.alt, shift: !!key.shift };
    const ctx = buildContext(editor, cm, getViewport(cm, screen));
    const result = plugin.onKeyDown(keyInfo, ctx);
    if (result?.handled) {
      if (result.edit) {
        snap(undo, "plugin-key", cm, editor);
        applyEditResult(result.edit, editor, cm);
        commit(undo, cm, editor);
      }
      cm.clampAll(editor.lines);
      return "continue";
    }
  }

  // Ctrl+Space (NUL byte) or Ctrl+N — trigger autocomplete
  if (key.raw.length === 1 && key.raw[0] === 0x00) return "complete";
  if (key.ctrl && key.name === "n") return "complete";

  // --- bracketed paste: terminal paste with multi-line support ---
  if (key.name === "bracketedPaste") {
    const text = key.raw.toString("utf8");
    if (text.length > 0) {
      snap(undo, "paste", cm, editor);
      // normalize line endings + strip control chars (keep \n and \t)
      const normalized = stripControlChars(text.replace(/\r\n?/g, "\n"));
      cm.forEachBottomUp((c) => {
        if (c.anchor) {
          cm.deleteSelection(c, editor.lines);
          editor.dirty = true;
        }
        const pos = ed.pasteText(editor, c.x, c.y, normalized);
        c.x = pos.x;
        c.y = pos.y;
      });
      editor.dirty = true;
      commit(undo, cm, editor);
    }
    return "continue";
  }

  // --- multi-cursor: ctrl+shift+up/down (Linux/macOS) or ctrl+alt+up/down (Windows/WSL) ---
  const isWindows = process.platform === "win32" || !!process.env["WSL_DISTRO_NAME"];
  const isMultiCursorCombo =
    (key.name === "up" || key.name === "down") && key.ctrl && (isWindows ? key.alt : key.shift);
  if (isMultiCursorCombo) {
    const allCursors = cm.all;
    if (key.name === "up") {
      const topmost = Math.min(...allCursors.map((c) => c.y));
      const newY = topmost - 1;
      if (newY >= 0) {
        const newX = Math.min(cm.primary.x, editor.lines[newY].length);
        cm.addAbove(newX, newY);
        cm.dedup();
      }
    } else {
      const bottommost = Math.max(...allCursors.map((c) => c.y));
      const newY = bottommost + 1;
      if (newY < editor.lines.length) {
        const newX = Math.min(cm.primary.x, editor.lines[newY].length);
        cm.addBelow();
        const last = cm.all[cm.all.length - 1];
        last.x = newX;
        last.y = newY;
        cm.dedup();
      }
    }
    return "continue";
  }

  // --- selection with shift ---

  // shift+ctrl+arrow: select word by word
  if (key.shift && key.ctrl && (key.name === "left" || key.name === "right")) {
    cm.startSelectionAll();
    cm.moveWordAll(key.name, editor.lines);
    cm.clampAll(editor.lines);
    cm.collapseEmptySelections();
    return "continue";
  }

  // shift+arrow: select char/line
  if (key.shift && ["up", "down", "left", "right", "home", "end"].includes(key.name)) {
    cm.startSelectionAll();
    cm.moveAll(key.name as any, editor.lines, screen.height - 2);
    cm.clampAll(editor.lines);

    // shift+up/down with multi-cursor: merge into one selection
    if (cm.isMulti && (key.name === "up" || key.name === "down")) {
      cm.mergeIntoSelection(key.name);
      return "continue";
    }

    cm.collapseEmptySelections();
    return "continue";
  }

  // --- escape ---
  if (key.raw.length === 1 && key.raw[0] === 0x1b) {
    if (cm.isMulti) {
      cm.clearExtras();
      return "continue";
    }
  }

  // --- alt+up/down: move lines ---
  if (key.alt && (key.name === "up" || key.name === "down")) {
    const p = cm.primary;
    const range = cm.getSelection(p);
    const startLine = range ? range.start.y : p.y;
    const endLine = range ? range.end.y : p.y;

    snap(undo, "move-line", cm, editor);
    if (key.name === "up") {
      if (ed.moveLinesUp(editor, startLine, endLine)) {
        p.y--;
        if (p.anchor) p.anchor = { x: p.anchor.x, y: p.anchor.y - 1 };
      }
    } else {
      if (ed.moveLinesDown(editor, startLine, endLine)) {
        p.y++;
        if (p.anchor) p.anchor = { x: p.anchor.x, y: p.anchor.y + 1 };
      }
    }
    commit(undo, cm, editor);
    cm.clampAll(editor.lines);
    return "continue";
  }

  // --- function keys (never insert as text) ---
  if (key.name === "f9") {
    return "settings";
  }

  if (key.name === "f1" || key.name === "f2" || key.name === "f3" || key.name === "f4") {
    if (key.name === "f1") return "help";
    if (key.name === "f2") return "history";
    if (key.name === "f4") return "diagnostics";
    if (key.name === "f3" && plugin?.onFormat) {
      const linesBefore = [...editor.lines];
      snap(undo, "format", cm, editor);
      const ctx = buildContext(editor, cm, getViewport(cm, screen));
      const result = plugin.onFormat(ctx);
      if (result) applyEditResult(result, editor, cm);
      // only commit if content actually changed
      const changed =
        editor.lines.length !== linesBefore.length ||
        editor.lines.some((l, i) => l !== linesBefore[i]);
      if (changed) {
        commit(undo, cm, editor);
      }
      cm.clampAll(editor.lines);
    }
    return "continue";
  }

  // --- ctrl shortcuts ---
  if (key.ctrl) {
    const p = cm.primary;

    switch (key.name) {
      case "q":
        return "exit";

      case "s":
        return "save";

      case "f":
        return "search";

      case "a": {
        cm.clearExtras();
        const lastLine = editor.lines.length - 1;
        cm.primary.anchor = { x: 0, y: 0 };
        cm.primary.x = editor.lines[lastLine].length;
        cm.primary.y = lastLine;
        break;
      }

      case "g":
        return "goto";

      case "d": {
        cm.selectNextOccurrence(editor.lines);
        break;
      }

      case "left":
        cm.moveWordAll("left", editor.lines);
        break;

      case "right":
        cm.moveWordAll("right", editor.lines);
        break;

      case "backspace": {
        snap(undo, "delete-word", cm, editor);
        cm.forEachBottomUp((c) => {
          if (c.anchor) {
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          } else {
            const b = wordBoundaryLeft(editor.lines[c.y], c.x);
            const pos = ed.deleteWordBack(editor, c.x, c.y, b);
            c.x = pos.x;
            c.y = pos.y;
          }
        });
        commit(undo, cm, editor);
        break;
      }

      case "delete": {
        snap(undo, "delete-word", cm, editor);
        cm.forEachBottomUp((c) => {
          if (c.anchor) {
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          } else {
            const b = wordBoundaryRight(editor.lines[c.y], c.x);
            ed.deleteWordForward(editor, c.x, c.y, b);
          }
        });
        commit(undo, cm, editor);
        break;
      }

      case "z": {
        const result = undo.undo(editor.lines, p);
        if (result) {
          editor.lines = result.lines;
          editor.dirty = true;
          if (result.cursorState) cm.restoreState(result.cursorState);
        }
        break;
      }

      case "y": {
        const result = undo.redo(editor.lines, p);
        if (result) {
          editor.lines = result.lines;
          editor.dirty = true;
          if (result.cursorState) cm.restoreState(result.cursorState);
        }
        break;
      }

      case "c": {
        const parts: string[] = [];
        cm.forEachAll((c) => {
          const text = cm.getSelectedText(c, editor.lines);
          if (text) parts.push(text);
        });
        if (parts.length > 0) {
          editor.clipboardParts = parts;
          void copyToSystemClipboard(parts.join("\n"));
        }
        break;
      }

      case "x": {
        snap(undo, "cut", cm, editor);
        const parts: string[] = [];
        cm.forEachBottomUp((c) => {
          if (c.anchor) {
            parts.unshift(cm.getSelectedText(c, editor.lines));
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          } else {
            parts.unshift(editor.lines[c.y]);
            editor.lines.splice(c.y, 1);
            if (editor.lines.length === 0) editor.lines = [""];
            if (c.y >= editor.lines.length) c.y = editor.lines.length - 1;
            c.x = Math.min(c.x, editor.lines[c.y].length);
            editor.dirty = true;
          }
        });
        editor.clipboardParts = parts;
        void copyToSystemClipboard(parts.join("\n"));
        commit(undo, cm, editor);
        break;
      }

      case "v": {
        if (editor.clipboardParts.length === 0) break;
        snap(undo, "paste", cm, editor);

        const parts = editor.clipboardParts;
        const cursorCount = cm.count;

        if (parts.length === cursorCount) {
          // same number of parts as cursors: each cursor gets its own part
          cm.forEachBottomUp((c) => {
            const partIdx = cm.all.indexOf(c);
            if (c.anchor) {
              cm.deleteSelection(c, editor.lines);
              editor.dirty = true;
            }
            const pos = ed.pasteText(editor, c.x, c.y, parts[partIdx]);
            c.x = pos.x;
            c.y = pos.y;
          });
        } else if (cursorCount === 1) {
          // single cursor, multiple parts: paste all parts as lines
          const c = cm.primary;
          if (c.anchor) {
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          }
          // insert all parts: each on its own line, last at cursor position
          for (let i = 0; i < parts.length - 1; i++) {
            editor.lines.splice(c.y + i, 0, parts[i]);
          }
          c.y += parts.length - 1;
          const lastPart = parts[parts.length - 1];
          const line = editor.lines[c.y];
          editor.lines[c.y] = line.substring(0, c.x) + lastPart + line.substring(c.x);
          c.x += lastPart.length;
          editor.dirty = true;
        } else {
          // different count: paste everything joined at each cursor
          const joined = parts.join("\n");
          cm.forEachBottomUp((c) => {
            if (c.anchor) {
              cm.deleteSelection(c, editor.lines);
              editor.dirty = true;
            }
            const pos = ed.pasteText(editor, c.x, c.y, joined);
            c.x = pos.x;
            c.y = pos.y;
          });
        }

        commit(undo, cm, editor);
        break;
      }
    }

    cm.clampAll(editor.lines);
    return "continue";
  }

  // --- normal keys ---

  switch (key.name) {
    // navigation
    case "up":
    case "down":
    case "left":
    case "right":
    case "home":
    case "end":
      cm.clearSelectionAll();
      cm.moveAll(key.name, editor.lines, 0);
      break;
    case "pageup":
    case "pagedown":
      cm.clearSelectionAll();
      cm.moveAll(key.name, editor.lines, screen.height - 2);
      break;

    // enter
    case "enter": {
      snap(undo, "enter", cm, editor);

      const sorted = [...cm.all].sort((a, b) => a.y - b.y || a.x - b.x);
      let lineShift = 0;
      for (const c of sorted) {
        c.y += lineShift;
        const prev = { x: c.x, y: c.y };
        if (c.anchor) {
          cm.deleteSelection(c, editor.lines);
          editor.dirty = true;
        }
        const pos = ed.insertNewline(editor, c.x, c.y);
        c.x = pos.x;
        c.y = pos.y;
        notifyPlugin(plugin, "newline", c, prev, editor, cm, screen);
        lineShift++;
      }

      commit(undo, cm, editor);
      break;
    }

    // backspace
    case "backspace": {
      snap(undo, "backspace", cm, editor);
      cm.forEachBottomUp((c) => {
        const prev = { x: c.x, y: c.y };
        let deleted: string | undefined;
        if (c.anchor) {
          deleted = cm.getSelectedText(c, editor.lines);
          cm.deleteSelection(c, editor.lines);
          editor.dirty = true;
        } else {
          // capture char before cursor
          if (c.x > 0) deleted = editor.lines[c.y][c.x - 1];
          else if (c.y > 0) deleted = "\n";
          const pos = ed.deleteCharBack(editor, c.x, c.y);
          c.x = pos.x;
          c.y = pos.y;
        }
        notifyPlugin(plugin, "backspace", c, prev, editor, cm, screen, { deletedText: deleted });
      });
      commit(undo, cm, editor);
      break;
    }

    // delete
    case "delete": {
      snap(undo, "delete", cm, editor);
      cm.forEachBottomUp((c) => {
        const prev = { x: c.x, y: c.y };
        let deleted: string | undefined;
        if (c.anchor) {
          deleted = cm.getSelectedText(c, editor.lines);
          cm.deleteSelection(c, editor.lines);
          editor.dirty = true;
        } else {
          // capture char at cursor
          if (c.x < editor.lines[c.y].length) deleted = editor.lines[c.y][c.x];
          else if (c.y < editor.lines.length - 1) deleted = "\n";
          ed.deleteCharForward(editor, c.x, c.y);
        }
        notifyPlugin(plugin, "delete", c, prev, editor, cm, screen, { deletedText: deleted });
      });
      commit(undo, cm, editor);
      break;
    }

    // tab
    case "tab": {
      snap(undo, "tab", cm, editor);
      const s = getEditorSettings();
      cm.forEachBottomUp((c) => {
        const prev = { x: c.x, y: c.y };
        c.x = ed.insertTab(editor, c.x, c.y, s.tabSize, s.insertSpaces);
        notifyPlugin(plugin, "tab", c, prev, editor, cm, screen);
      });
      commit(undo, cm, editor);
      break;
    }

    // regular character
    default: {
      const ch = key.name;
      if (ch === "unknown") break;

      // multi-char input with newlines = raw paste (no bracketed paste support)
      const normalized = stripControlChars(ch.replace(/\r\n?/g, "\n"));
      if (normalized.includes("\n")) {
        snap(undo, "paste", cm, editor);
        cm.forEachBottomUp((c) => {
          if (c.anchor) {
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          }
          const pos = ed.pasteText(editor, c.x, c.y, normalized);
          c.x = pos.x;
          c.y = pos.y;
        });
        editor.dirty = true;
        commit(undo, cm, editor);
        break;
      }

      const code = ch.codePointAt(0) ?? 0;
      if (code >= 32) {
        snap(undo, "type", cm, editor);

        cm.forEachBottomUp((c) => {
          const prev = { x: c.x, y: c.y };
          if (c.anchor) {
            cm.deleteSelection(c, editor.lines);
            editor.dirty = true;
          }
          c.x = ed.insertChar(editor, c.x, c.y, ch);
          notifyPlugin(plugin, "char", c, prev, editor, cm, screen, { char: ch });
        });

        commit(undo, cm, editor);
      }
      break;
    }
  }

  cm.clampAll(editor.lines);
  cm.dedup();
  return "continue";
}
