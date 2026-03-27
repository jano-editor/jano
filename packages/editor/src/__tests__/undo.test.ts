import { describe, it, expect } from "vitest";
import { createUndoManager } from "../undo.ts";
import type { CursorSnapshot } from "../cursor-manager.ts";

function makeCursorState(cursors: { x: number; y: number }[]): CursorSnapshot {
  return {
    cursors: cursors.map((c) => ({ x: c.x, y: c.y, anchor: null })),
    scrollX: 0,
    scrollY: 0,
  };
}

describe("UndoManager", () => {
  it("undo restores previous lines", () => {
    const um = createUndoManager();
    const before = ["hello"];
    const after = ["hello world"];

    um.snapshot("type", { x: 5, y: 0 }, [...before]);
    um.commit({ x: 11, y: 0 }, [...after]);

    const cursor = { x: 11, y: 0 };
    const result = um.undo([...after], cursor);

    expect(result).not.toBeNull();
    expect(result!.lines).toEqual(["hello"]);
    expect(cursor.x).toBe(5);
  });

  it("redo re-applies after undo", () => {
    const um = createUndoManager();

    um.snapshot("type", { x: 0, y: 0 }, ["aaa"]);
    um.commit({ x: 3, y: 0 }, ["aaabbb"]);

    const cursor = { x: 3, y: 0 };
    um.undo(["aaabbb"], cursor);

    const result = um.redo(["aaa"], cursor);
    expect(result).not.toBeNull();
    expect(result!.lines).toEqual(["aaabbb"]);
  });

  it("new change after undo clears redo stack", () => {
    const um = createUndoManager();

    um.snapshot("type", { x: 0, y: 0 }, ["a"]);
    um.commit({ x: 1, y: 0 }, ["ab"]);

    um.undo(["ab"], { x: 1, y: 0 });

    // new change
    um.snapshot("type", { x: 0, y: 0 }, ["a"]);
    um.commit({ x: 1, y: 0 }, ["ac"]);

    // redo should return null — stack was cleared
    const result = um.redo(["ac"], { x: 1, y: 0 });
    expect(result).toBeNull();
  });

  it("skips commit if nothing changed", () => {
    const um = createUndoManager();

    um.snapshot("type", { x: 0, y: 0 }, ["same"]);
    um.commit({ x: 0, y: 0 }, ["same"]);

    expect(um.getHistory().length).toBe(0);
  });

  it("restores multi-cursor state on undo", () => {
    const um = createUndoManager();

    const stateBefore = makeCursorState([
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 0, y: 5 },
    ]);
    const stateAfter = makeCursorState([
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 4, y: 5 },
    ]);

    um.snapshot("type", { x: 0, y: 0 }, ["aaa", "bbb", "ccc", "ddd", "eee", "fff"], stateBefore);
    um.commit({ x: 4, y: 0 }, ["aaaXXXX", "bbb", "ccc", "dddXXXX", "eee", "fffXXXX"], stateAfter);

    const cursor = { x: 4, y: 0 };
    const result = um.undo(["aaaXXXX", "bbb", "ccc", "dddXXXX", "eee", "fffXXXX"], cursor);

    expect(result).not.toBeNull();
    expect(result!.cursorState).not.toBeNull();
    expect(result!.cursorState!.cursors.length).toBe(3);
    expect(result!.cursorState!.cursors[0]).toEqual({ x: 0, y: 0, anchor: null });
    expect(result!.cursorState!.cursors[2]).toEqual({ x: 0, y: 5, anchor: null });
  });

  it("groups rapid typing into one undo entry", () => {
    const um = createUndoManager();

    // simulate fast typing: h, e, l, l, o
    const steps = ["h", "he", "hel", "hell", "hello"];
    for (let i = 0; i < steps.length; i++) {
      const prev = i === 0 ? "" : steps[i - 1];
      um.snapshot("type", { x: i, y: 0 }, [prev]);
      um.commit({ x: i + 1, y: 0 }, [steps[i]]);
    }

    // should be grouped into fewer entries than 5
    expect(um.getHistory().length).toBeLessThan(5);

    // one undo should revert all grouped typing
    const cursor = { x: 5, y: 0 };
    const result = um.undo(["hello"], cursor);
    expect(result).not.toBeNull();
    expect(result!.lines[0]).toBe("");
  });

  it("does not group different action types", () => {
    const um = createUndoManager();

    um.snapshot("type", { x: 0, y: 0 }, [""]);
    um.commit({ x: 3, y: 0 }, ["abc"]);

    um.snapshot("enter", { x: 3, y: 0 }, ["abc"]);
    um.commit({ x: 0, y: 1 }, ["abc", ""]);

    expect(um.getHistory().length).toBe(2);
  });
});
