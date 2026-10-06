import type { EditResult, Position } from "./types.ts";
import type { EditorState } from "../editor.ts";
import type { CursorManager, SingleCursor } from "../cursor-manager.ts";
import { log } from "../utils/logger.ts";

// Plugin results are untrusted: positions get clamped into the buffer and malformed
// parts are skipped, so a buggy plugin can't crash the editor or empty the buffer.

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : min;
}

function isPosition(p: unknown): p is Position {
  if (typeof p !== "object" || p === null) return false;
  const { line, col } = p as Position;
  return Number.isFinite(line) && Number.isFinite(col);
}

// apply edit result, optionally targeting a specific cursor instead of primary
export function applyEditResult(
  result: EditResult,
  editor: EditorState,
  cm: CursorManager,
  targetCursor?: SingleCursor,
) {
  const problems: string[] = [];

  const clampPos = (pos: Position) => {
    const line = clamp(pos.line, 0, editor.lines.length - 1);
    const col = clamp(pos.col, 0, editor.lines[line].length);
    if (line !== pos.line || col !== pos.col) problems.push("position out of range");
    return { line, col };
  };

  if (result.replaceAll) {
    const valid =
      Array.isArray(result.replaceAll) && result.replaceAll.every((l) => typeof l === "string");
    if (!valid) {
      problems.push("replaceAll is not a string array");
    } else {
      // the buffer always has at least one line
      const next = result.replaceAll.length > 0 ? result.replaceAll : [""];
      // only apply if content actually differs
      const changed =
        next.length !== editor.lines.length || next.some((l, i) => l !== editor.lines[i]);
      log.debug({
        action: "plugin_apply_replace_all",
        lineCountBefore: editor.lines.length,
        lineCountAfter: next.length,
        changed,
      });
      if (changed) {
        editor.lines = next;
        editor.dirty = true;
      }
    }
  }

  if (result.edits && !Array.isArray(result.edits)) {
    problems.push("edits is not an array");
  } else if (result.edits) {
    if (result.edits.length > 0) {
      log.debug({ action: "plugin_apply_edits", count: result.edits.length });
    }
    const valid = result.edits.filter((edit) => {
      const ok =
        typeof edit?.text === "string" &&
        isPosition(edit.range?.start) &&
        isPosition(edit.range?.end);
      if (!ok) problems.push("malformed edit");
      return ok;
    });

    const sorted = valid.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.col - a.range.start.col;
    });

    for (const edit of sorted) {
      let start = clampPos(edit.range.start);
      let end = clampPos(edit.range.end);
      if (start.line > end.line || (start.line === end.line && start.col > end.col)) {
        [start, end] = [end, start];
      }

      if (start.line === end.line) {
        const line = editor.lines[start.line];
        editor.lines[start.line] =
          line.substring(0, start.col) + edit.text + line.substring(end.col);
      } else {
        const firstPart = editor.lines[start.line].substring(0, start.col);
        const lastPart = editor.lines[end.line].substring(end.col);
        const newLines = edit.text.split("\n");
        newLines[0] = firstPart + newLines[0];
        newLines[newLines.length - 1] = newLines[newLines.length - 1] + lastPart;
        editor.lines.splice(start.line, end.line - start.line + 1, ...newLines);
      }

      editor.dirty = true;
    }
  }

  if (result.cursors && result.cursors.length > 0) {
    const resultCursor = result.cursors[0];
    if (!isPosition(resultCursor?.position)) {
      problems.push("malformed cursor");
    } else {
      const target = targetCursor ?? cm.primary;
      const pos = clampPos(resultCursor.position);
      target.x = pos.col;
      target.y = pos.line;
      if (isPosition(resultCursor.anchor)) {
        const anchor = clampPos(resultCursor.anchor);
        target.anchor = { x: anchor.col, y: anchor.line };
      } else {
        target.anchor = null;
      }
    }
  }

  if (problems.length > 0) {
    log.warn({ action: "plugin_edit_invalid", problems: [...new Set(problems)] });
  }
}
