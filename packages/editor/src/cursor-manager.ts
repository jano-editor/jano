import type { Pos, SelectionRange } from "./types.ts";

export interface SingleCursor {
  x: number;
  y: number;
  anchor: Pos | null;
}

export interface CursorSnapshot {
  cursors: { x: number; y: number; anchor: Pos | null }[];
  scrollX: number;
  scrollY: number;
}

export interface CursorManager {
  readonly primary: SingleCursor;
  readonly all: readonly SingleCursor[];
  readonly count: number;
  readonly isMulti: boolean;

  scrollX: number;
  scrollY: number;

  // snapshot/restore for undo
  saveState(): CursorSnapshot;
  restoreState(snapshot: CursorSnapshot): void;

  // add/remove cursors
  addAbove(x: number, y: number): void;
  addBelow(): void;
  clearExtras(): void;

  // get ordered selection range for a cursor (start always before end)
  getSelection(c: SingleCursor): SelectionRange | null;

  // get selected text for a cursor
  getSelectedText(c: SingleCursor, lines: string[]): string;

  // check if a cell is selected by any cursor
  isCellSelected(lineIdx: number, colIdx: number): boolean;

  // check if a cell has an extra cursor on it
  isCellExtraCursor(lineIdx: number, colIdx: number): boolean;

  // start or extend selection for all cursors
  startSelectionAll(): void;

  // clear selection on all cursors
  clearSelectionAll(): void;

  // collapse selections that returned to their anchor
  collapseEmptySelections(): void;

  // run a function on every cursor, bottom-up sorted (for edits)
  forEachBottomUp(fn: (c: SingleCursor, isPrimary: boolean) => void): void;

  // run a function on every cursor, any order (for navigation)
  forEachAll(fn: (c: SingleCursor, isPrimary: boolean) => void): void;

  // move all cursors
  moveAll(
    direction: "up" | "down" | "left" | "right" | "home" | "end" | "pageup" | "pagedown",
    lines: string[],
    pageSize: number,
  ): void;

  // move all cursors by word
  moveWordAll(direction: "left" | "right", lines: string[]): void;

  // merge all cursors into one selection (for shift+up/down with multi)
  mergeIntoSelection(direction: "up" | "down"): void;

  // clamp all cursors to valid positions
  clampAll(lines: string[]): void;

  // remove duplicate cursors
  dedup(): void;

  // ensure primary cursor is visible in viewport
  ensureVisible(viewW: number, viewH: number): void;

  // delete the selection of a specific cursor from lines
  deleteSelection(c: SingleCursor, lines: string[]): void;
}

// word boundary utils
function wordBoundaryLeft(line: string, col: number): number {
  if (col <= 0) return 0;
  let i = col - 1;
  while (i > 0 && /\s/.test(line[i])) i--;
  if (i >= 0 && /[^\w\s]/.test(line[i])) {
    while (i > 0 && /[^\w\s]/.test(line[i - 1])) i--;
    return i;
  }
  while (i > 0 && /\w/.test(line[i - 1])) i--;
  return i;
}

function wordBoundaryRight(line: string, col: number): number {
  const len = line.length;
  if (col >= len) return len;
  let i = col;
  if (/\w/.test(line[i])) {
    while (i < len && /\w/.test(line[i])) i++;
  } else if (/[^\w\s]/.test(line[i])) {
    while (i < len && /[^\w\s]/.test(line[i])) i++;
  }
  while (i < len && /\s/.test(line[i])) i++;
  return i;
}

function getSelRange(c: SingleCursor): SelectionRange | null {
  if (!c.anchor) return null;
  const a = c.anchor;
  const b = { x: c.x, y: c.y };
  if (a.y < b.y || (a.y === b.y && a.x <= b.x)) {
    return { start: a, end: b };
  }
  return { start: b, end: a };
}

function isInRange(range: SelectionRange | null, lineIdx: number, colIdx: number): boolean {
  if (!range) return false;
  if (lineIdx < range.start.y || lineIdx > range.end.y) return false;
  if (lineIdx === range.start.y && colIdx < range.start.x) return false;
  if (lineIdx === range.end.y && colIdx >= range.end.x) return false;
  return true;
}

function clampCursor(c: SingleCursor, lines: string[]) {
  if (c.y < 0) c.y = 0;
  if (c.y >= lines.length) c.y = lines.length - 1;
  const lineLen = lines[c.y].length;
  if (c.x < 0) c.x = 0;
  if (c.x > lineLen) c.x = lineLen;
}

function moveLeftOne(c: SingleCursor, lines: string[]) {
  if (c.x > 0) c.x--;
  else if (c.y > 0) {
    c.y--;
    c.x = lines[c.y].length;
  }
}

function moveRightOne(c: SingleCursor, lines: string[]) {
  if (c.x < lines[c.y].length) c.x++;
  else if (c.y < lines.length - 1) {
    c.y++;
    c.x = 0;
  }
}

export function createCursorManager(): CursorManager {
  const cursors: SingleCursor[] = [{ x: 0, y: 0, anchor: null }];
  let scrollX = 0;
  let scrollY = 0;

  const mgr: CursorManager = {
    get primary() {
      return cursors[0];
    },
    get all() {
      return cursors;
    },
    get count() {
      return cursors.length;
    },
    get isMulti() {
      return cursors.length > 1;
    },

    get scrollX() {
      return scrollX;
    },
    set scrollX(v) {
      scrollX = v;
    },
    get scrollY() {
      return scrollY;
    },
    set scrollY(v) {
      scrollY = v;
    },

    saveState(): CursorSnapshot {
      return {
        cursors: cursors.map((c) => ({
          x: c.x,
          y: c.y,
          anchor: c.anchor ? { ...c.anchor } : null,
        })),
        scrollX,
        scrollY,
      };
    },

    restoreState(snapshot: CursorSnapshot) {
      cursors.length = 0;
      for (const c of snapshot.cursors) {
        cursors.push({ x: c.x, y: c.y, anchor: c.anchor ? { ...c.anchor } : null });
      }
      scrollX = snapshot.scrollX;
      scrollY = snapshot.scrollY;
    },

    addAbove(x: number, y: number) {
      cursors.push({ x, y, anchor: null });
    },

    addBelow() {
      const allY = cursors.map((c) => c.y);
      const lowestY = Math.max(...allY);
      const newY = lowestY + 1;
      const newX = cursors[0].x;
      cursors.push({ x: newX, y: newY, anchor: null });
    },

    clearExtras() {
      cursors.splice(1);
    },

    getSelection(c) {
      return getSelRange(c);
    },

    getSelectedText(c, lines) {
      const range = getSelRange(c);
      if (!range) return "";
      if (range.start.y === range.end.y) {
        return lines[range.start.y].substring(range.start.x, range.end.x);
      }
      const parts: string[] = [];
      parts.push(lines[range.start.y].substring(range.start.x));
      for (let y = range.start.y + 1; y < range.end.y; y++) parts.push(lines[y]);
      parts.push(lines[range.end.y].substring(0, range.end.x));
      return parts.join("\n");
    },

    isCellSelected(lineIdx, colIdx) {
      return cursors.some((c) => isInRange(getSelRange(c), lineIdx, colIdx));
    },

    isCellExtraCursor(lineIdx, colIdx) {
      return cursors.slice(1).some((c) => c.y === lineIdx && c.x === colIdx);
    },

    startSelectionAll() {
      for (const c of cursors) {
        if (!c.anchor) c.anchor = { x: c.x, y: c.y };
      }
    },

    clearSelectionAll() {
      for (const c of cursors) c.anchor = null;
    },

    collapseEmptySelections() {
      for (const c of cursors) {
        if (c.anchor && c.x === c.anchor.x && c.y === c.anchor.y) {
          c.anchor = null;
        }
      }
    },

    forEachBottomUp(fn) {
      const indexed = cursors.map((c, i) => ({ c, i }));
      indexed.sort((a, b) => b.c.y - a.c.y || b.c.x - a.c.x);
      for (const { c, i } of indexed) {
        fn(c, i === 0);
      }
    },

    forEachAll(fn) {
      cursors.forEach((c, i) => fn(c, i === 0));
    },

    moveAll(direction, lines, pageSize) {
      for (const c of cursors) {
        switch (direction) {
          case "up":
            c.y--;
            break;
          case "down":
            c.y++;
            break;
          case "left":
            moveLeftOne(c, lines);
            break;
          case "right":
            moveRightOne(c, lines);
            break;
          case "home":
            c.x = 0;
            break;
          case "end":
            c.x = lines[c.y]?.length ?? 0;
            break;
          case "pageup":
            c.y -= pageSize;
            break;
          case "pagedown":
            c.y += pageSize;
            break;
        }
      }
    },

    moveWordAll(direction, lines) {
      for (const c of cursors) {
        if (direction === "left") {
          if (c.x > 0) c.x = wordBoundaryLeft(lines[c.y], c.x);
          else if (c.y > 0) {
            c.y--;
            c.x = lines[c.y].length;
          }
        } else {
          if (c.x < lines[c.y].length) c.x = wordBoundaryRight(lines[c.y], c.x);
          else if (c.y < lines.length - 1) {
            c.y++;
            c.x = 0;
          }
        }
      }
    },

    mergeIntoSelection(direction) {
      if (cursors.length <= 1) return;

      const all: Pos[] = [];
      for (const c of cursors) {
        all.push({ x: c.x, y: c.y });
        if (c.anchor) all.push(c.anchor);
      }

      let min = all[0],
        max = all[0];
      for (const p of all) {
        if (p.y < min.y || (p.y === min.y && p.x < min.x)) min = p;
        if (p.y > max.y || (p.y === max.y && p.x > max.x)) max = p;
      }

      cursors.splice(1);
      if (direction === "down") {
        cursors[0].anchor = { ...min };
        cursors[0].x = max.x;
        cursors[0].y = max.y;
      } else {
        cursors[0].anchor = { ...max };
        cursors[0].x = min.x;
        cursors[0].y = min.y;
      }
    },

    clampAll(lines) {
      for (const c of cursors) clampCursor(c, lines);
    },

    dedup() {
      const seen = new Set<string>();
      seen.add(`${cursors[0].x},${cursors[0].y}`);
      for (let i = cursors.length - 1; i >= 1; i--) {
        const key = `${cursors[i].x},${cursors[i].y}`;
        if (seen.has(key)) cursors.splice(i, 1);
        else seen.add(key);
      }
    },

    ensureVisible(viewW, viewH) {
      const p = cursors[0];
      if (p.y < scrollY) scrollY = p.y;
      if (p.y >= scrollY + viewH) scrollY = p.y - viewH + 1;
      if (p.x < scrollX) scrollX = p.x;
      if (p.x >= scrollX + viewW) scrollX = p.x - viewW + 1;
    },

    deleteSelection(c, lines) {
      const range = getSelRange(c);
      if (!range) return;
      if (range.start.y === range.end.y) {
        const line = lines[range.start.y];
        lines[range.start.y] = line.substring(0, range.start.x) + line.substring(range.end.x);
      } else {
        const before = lines[range.start.y].substring(0, range.start.x);
        const after = lines[range.end.y].substring(range.end.x);
        lines[range.start.y] = before + after;
        lines.splice(range.start.y + 1, range.end.y - range.start.y);
      }
      c.x = range.start.x;
      c.y = range.start.y;
      c.anchor = null;
    },
  };

  return mgr;
}

// re-export word boundary utils for external use (e.g. ctrl+backspace)
export { wordBoundaryLeft, wordBoundaryRight };
