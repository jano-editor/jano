import type { Pos, SelectionRange } from "./types.ts";
import type { CursorState } from "./cursor.ts";
import type { EditorState } from "./editor.ts";

export interface SelectionState {
  anchor: Pos | null;
}

export function createSelection(): SelectionState {
  return { anchor: null };
}

export function getRange(sel: SelectionState, cursor: CursorState): SelectionRange | null {
  if (!sel.anchor) return null;
  const a = sel.anchor;
  const b = { x: cursor.x, y: cursor.y };
  if (a.y < b.y || (a.y === b.y && a.x <= b.x)) {
    return { start: a, end: b };
  }
  return { start: b, end: a };
}

export function getText(range: SelectionRange, lines: string[]): string {
  if (range.start.y === range.end.y) {
    return lines[range.start.y].substring(range.start.x, range.end.x);
  }
  const parts: string[] = [];
  parts.push(lines[range.start.y].substring(range.start.x));
  for (let y = range.start.y + 1; y < range.end.y; y++) {
    parts.push(lines[y]);
  }
  parts.push(lines[range.end.y].substring(0, range.end.x));
  return parts.join("\n");
}

export function deleteRange(
  range: SelectionRange,
  editor: EditorState,
  cursor: CursorState,
  sel: SelectionState,
) {
  if (range.start.y === range.end.y) {
    const line = editor.lines[range.start.y];
    editor.lines[range.start.y] = line.substring(0, range.start.x) + line.substring(range.end.x);
  } else {
    const before = editor.lines[range.start.y].substring(0, range.start.x);
    const after = editor.lines[range.end.y].substring(range.end.x);
    editor.lines[range.start.y] = before + after;
    editor.lines.splice(range.start.y + 1, range.end.y - range.start.y);
  }
  cursor.x = range.start.x;
  cursor.y = range.start.y;
  sel.anchor = null;
  editor.dirty = true;
}

export function isSelected(range: SelectionRange | null, lineIdx: number, colIdx: number): boolean {
  if (!range) return false;
  if (lineIdx < range.start.y || lineIdx > range.end.y) return false;
  if (lineIdx === range.start.y && colIdx < range.start.x) return false;
  if (lineIdx === range.end.y && colIdx >= range.end.x) return false;
  return true;
}

export function clear(sel: SelectionState) {
  sel.anchor = null;
}

export function startOrExtend(sel: SelectionState, cursor: CursorState) {
  if (!sel.anchor) {
    sel.anchor = { x: cursor.x, y: cursor.y };
  }
}

export function collapseIfEmpty(sel: SelectionState, cursor: CursorState) {
  if (sel.anchor && cursor.x === sel.anchor.x && cursor.y === sel.anchor.y) {
    sel.anchor = null;
  }
}
