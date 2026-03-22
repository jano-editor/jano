import type { Pos } from './types.js';

interface LineDiff {
  index: number;
  old: string;
  new: string;
}

interface LineRemove {
  index: number;
  content: string;
}

interface LineInsert {
  index: number;
  content: string;
}

export interface UndoEntry {
  label: string;
  timestamp: number;
  cursorBefore: Pos;
  cursorAfter: Pos;
  diffs: LineDiff[];
  removed: LineRemove[];
  inserted: LineInsert[];
}

// time window for grouping rapid keystrokes (ms)
const GROUP_THRESHOLD = 800;

export interface UndoManager {
  snapshot(label: string, cursorBefore: Pos, linesBefore: string[]): void;
  commit(cursorAfter: Pos, linesAfter: string[]): void;
  undo(lines: string[], cursor: Pos): string[] | null;
  redo(lines: string[], cursor: Pos): string[] | null;
  getHistory(): readonly UndoEntry[];
  describeEntry(entry: UndoEntry): string;
  jumpTo(index: number, lines: string[], cursor: Pos): string[];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) + '…' : s;
}

export function createUndoManager(): UndoManager {
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];

  let pendingLabel = '';
  let pendingCursorBefore: Pos = { x: 0, y: 0 };
  let pendingLinesBefore: string[] = [];
  let hasPending = false;

  function buildEntry(
    label: string,
    cursorBefore: Pos,
    cursorAfter: Pos,
    linesBefore: string[],
    linesAfter: string[],
  ): UndoEntry {
    const diffs: LineDiff[] = [];
    const removed: LineRemove[] = [];
    const inserted: LineInsert[] = [];

    const minLen = Math.min(linesBefore.length, linesAfter.length);

    // find changed lines in shared range
    for (let i = 0; i < minLen; i++) {
      if (linesBefore[i] !== linesAfter[i]) {
        diffs.push({ index: i, old: linesBefore[i], new: linesAfter[i] });
      }
    }

    // lines that were removed
    for (let i = minLen; i < linesBefore.length; i++) {
      removed.push({ index: i, content: linesBefore[i] });
    }

    // lines that were inserted
    for (let i = minLen; i < linesAfter.length; i++) {
      inserted.push({ index: i, content: linesAfter[i] });
    }

    return {
      label,
      timestamp: Date.now(),
      cursorBefore,
      cursorAfter,
      diffs,
      removed,
      inserted,
    };
  }

  function applyUndo(entry: UndoEntry, lines: string[], cursor: Pos): string[] {
    const result = [...lines];

    // remove inserted lines (reverse order)
    for (let i = entry.inserted.length - 1; i >= 0; i--) {
      const ins = entry.inserted[i];
      if (ins.index < result.length) {
        result.splice(ins.index, 1);
      }
    }

    // restore removed lines
    for (const rem of entry.removed) {
      result.splice(rem.index, 0, rem.content);
    }

    // revert diffs
    for (const diff of entry.diffs) {
      if (diff.index < result.length) {
        result[diff.index] = diff.old;
      }
    }

    cursor.x = entry.cursorBefore.x;
    cursor.y = entry.cursorBefore.y;

    return result;
  }

  function applyRedo(entry: UndoEntry, lines: string[], cursor: Pos): string[] {
    const result = [...lines];

    // apply diffs
    for (const diff of entry.diffs) {
      if (diff.index < result.length) {
        result[diff.index] = diff.new;
      }
    }

    // remove the lines that were originally removed
    for (let i = entry.removed.length - 1; i >= 0; i--) {
      const rem = entry.removed[i];
      if (rem.index < result.length) {
        result.splice(rem.index, 1);
      }
    }

    // re-insert the lines that were originally inserted
    for (const ins of entry.inserted) {
      result.splice(ins.index, 0, ins.content);
    }

    cursor.x = entry.cursorAfter.x;
    cursor.y = entry.cursorAfter.y;

    return result;
  }

  function canGroup(label: string): boolean {
    if (undoStack.length === 0) return false;
    const last = undoStack[undoStack.length - 1];
    if (last.label !== label) return false;
    if (Date.now() - last.timestamp > GROUP_THRESHOLD) return false;
    // only group single-char typing
    if (label !== 'type') return false;
    return true;
  }

  return {
    snapshot(label: string, cursorBefore: Pos, linesBefore: string[]) {
      pendingLabel = label;
      pendingCursorBefore = { ...cursorBefore };
      pendingLinesBefore = [...linesBefore];
      hasPending = true;
    },

    commit(cursorAfter: Pos, linesAfter: string[]) {
      if (!hasPending) return;
      hasPending = false;

      // check if anything actually changed
      if (
        pendingLinesBefore.length === linesAfter.length &&
        pendingLinesBefore.every((l, i) => l === linesAfter[i])
      ) {
        return;
      }

      // group rapid typing
      if (canGroup(pendingLabel)) {
        const last = undoStack[undoStack.length - 1];
        // extend the last entry: keep its cursorBefore/linesBefore, update after
        const merged = buildEntry(
          pendingLabel,
          last.cursorBefore,
          { ...cursorAfter },
          applyUndo(last, linesAfter, { ...cursorAfter }), // reconstruct original
          [...linesAfter],
        );
        // fix: just update cursor, the merged entry replaces the last
        merged.cursorBefore = last.cursorBefore;
        undoStack[undoStack.length - 1] = merged;
      } else {
        const entry = buildEntry(
          pendingLabel,
          pendingCursorBefore,
          { ...cursorAfter },
          pendingLinesBefore,
          [...linesAfter],
        );
        undoStack.push(entry);
      }

      // new change clears redo stack
      redoStack.length = 0;
    },

    undo(lines: string[], cursor: Pos): string[] | null {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push(entry);
      return applyUndo(entry, lines, cursor);
    },

    redo(lines: string[], cursor: Pos): string[] | null {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push(entry);
      return applyRedo(entry, lines, cursor);
    },

    getHistory(): readonly UndoEntry[] {
      return undoStack;
    },

    describeEntry(entry: UndoEntry): string {
      const line = entry.cursorAfter.y + 1;

      // show what text was added or removed
      if (entry.diffs.length > 0) {
        const diff = entry.diffs[0];
        const added = diff.new.length > diff.old.length
          ? diff.new.substring(diff.old.length === 0 ? 0 : diff.old.length)
          : '';
        const removed = diff.old.length > diff.new.length
          ? diff.old.substring(diff.new.length === 0 ? 0 : diff.new.length)
          : '';

        if (entry.label === 'type' && added) {
          return `Ln ${line}: +"${truncate(added, 25)}"`;
        }
        if (entry.label === 'backspace' && removed) {
          return `Ln ${line}: -"${truncate(removed, 25)}"`;
        }
        if (entry.label === 'delete' && removed) {
          return `Ln ${line}: -"${truncate(removed, 25)}"`;
        }
        if (added && removed) {
          return `Ln ${line}: "${truncate(removed, 12)}" → "${truncate(added, 12)}"`;
        }
        if (added) return `Ln ${line}: +"${truncate(added, 25)}"`;
        if (removed) return `Ln ${line}: -"${truncate(removed, 25)}"`;
      }

      if (entry.inserted.length > 0) {
        const text = entry.inserted[0].content;
        return `Ln ${line}: +line "${truncate(text || '(empty)', 20)}"`;
      }

      if (entry.removed.length > 0) {
        const text = entry.removed[0].content;
        return `Ln ${line}: -line "${truncate(text || '(empty)', 20)}"`;
      }

      if (entry.label === 'enter') return `Ln ${line}: new line`;
      if (entry.label === 'tab') return `Ln ${line}: indent`;
      if (entry.label === 'cut') return `Ln ${line}: cut`;
      if (entry.label === 'paste') return `Ln ${line}: paste`;

      return `Ln ${line}: ${entry.label}`;
    },

    jumpTo(index: number, lines: string[], cursor: Pos): string[] {
      // undo everything back to the target index
      let current = lines;
      while (undoStack.length > index + 1) {
        const entry = undoStack.pop()!;
        redoStack.push(entry);
        current = applyUndo(entry, current, cursor);
      }
      // or redo forward if needed
      while (undoStack.length < index + 1 && redoStack.length > 0) {
        const entry = redoStack.pop()!;
        undoStack.push(entry);
        current = applyRedo(entry, current, cursor);
      }
      return current;
    },
  };
}
