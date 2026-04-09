import { basename, extname } from "node:path";
import type { PluginContext, Cursor, CursorAction, ActionType, Position } from "./types.ts";
import type { EditorState } from "../editor.ts";
import type { CursorManager, SingleCursor } from "../cursor-manager.ts";
import { getEditorSettings } from "../settings.ts";

export function buildContext(
  editor: EditorState,
  cm: CursorManager,
  viewport: { firstLine: number; lastLine: number; width: number; height: number },
  action?: CursorAction,
): PluginContext {
  const allCursors: Cursor[] = cm.all.map((c) => ({
    position: { line: c.y, col: c.x },
    anchor: c.anchor ? { line: c.anchor.y, col: c.anchor.x } : null,
  }));

  return {
    filePath: editor.filePath,
    fileName: basename(editor.filePath),
    extension: extname(editor.filePath),
    lines: editor.lines,
    lineCount: editor.lines.length,
    cursors: allCursors,
    action,
    viewport: {
      firstVisibleLine: viewport.firstLine,
      lastVisibleLine: viewport.lastLine,
      width: viewport.width,
      height: viewport.height,
    },
    dirty: editor.dirty,
    language: "",
    settings: {
      tabSize: getEditorSettings().tabSize,
      insertSpaces: getEditorSettings().insertSpaces,
    },
  };
}

export function buildAction(
  type: ActionType,
  c: SingleCursor,
  previousPosition: Position,
  extra?: { char?: string; pastedText?: string; deletedText?: string },
): CursorAction {
  return {
    type,
    cursor: {
      position: { line: c.y, col: c.x },
      anchor: c.anchor ? { line: c.anchor.y, col: c.anchor.x } : null,
    },
    previousPosition,
    char: extra?.char,
    pastedText: extra?.pastedText,
    deletedText: extra?.deletedText,
  };
}
