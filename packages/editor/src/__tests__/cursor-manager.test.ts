import { describe, it, expect } from "bun:test";
import { createCursorManager } from "../cursor-manager.ts";

describe("CursorManager", () => {
  describe("multi-cursor basics", () => {
    it("starts with one cursor at 0,0", () => {
      const cm = createCursorManager();
      expect(cm.count).toBe(1);
      expect(cm.isMulti).toBe(false);
      expect(cm.primary.x).toBe(0);
      expect(cm.primary.y).toBe(0);
    });

    it("addBelow creates a second cursor", () => {
      const cm = createCursorManager();
      cm.primary.y = 3;
      cm.addBelow();
      expect(cm.count).toBe(2);
      expect(cm.isMulti).toBe(true);
      expect(cm.all[1].y).toBe(4);
    });

    it("clearExtras removes all but primary", () => {
      const cm = createCursorManager();
      cm.addBelow();
      cm.addBelow();
      expect(cm.count).toBe(3);
      cm.clearExtras();
      expect(cm.count).toBe(1);
      expect(cm.isMulti).toBe(false);
    });

    it("dedup removes cursors on same position", () => {
      const cm = createCursorManager();
      cm.addAbove(0, 0); // same as primary
      expect(cm.count).toBe(2);
      cm.dedup();
      expect(cm.count).toBe(1);
    });
  });

  describe("forEachBottomUp", () => {
    it("processes cursors bottom to top", () => {
      const cm = createCursorManager();
      cm.primary.y = 1;
      cm.addAbove(0, 5);
      cm.addAbove(0, 3);

      const order: number[] = [];
      cm.forEachBottomUp((c) => {
        order.push(c.y);
      });

      expect(order).toEqual([5, 3, 1]);
    });
  });

  describe("selection", () => {
    it("startSelectionAll sets anchor on all cursors", () => {
      const cm = createCursorManager();
      cm.primary.x = 5;
      cm.primary.y = 2;
      cm.addAbove(3, 4);

      cm.startSelectionAll();

      expect(cm.primary.anchor).toEqual({ x: 5, y: 2 });
      expect(cm.all[1].anchor).toEqual({ x: 3, y: 4 });
    });

    it("getSelection returns ordered range", () => {
      const cm = createCursorManager();
      cm.primary.x = 10;
      cm.primary.y = 5;
      cm.primary.anchor = { x: 2, y: 3 };

      const sel = cm.getSelection(cm.primary);
      expect(sel).toEqual({
        start: { x: 2, y: 3 },
        end: { x: 10, y: 5 },
      });
    });

    it("getSelection handles reverse selection (anchor after cursor)", () => {
      const cm = createCursorManager();
      cm.primary.x = 2;
      cm.primary.y = 3;
      cm.primary.anchor = { x: 10, y: 5 };

      const sel = cm.getSelection(cm.primary);
      expect(sel).toEqual({
        start: { x: 2, y: 3 },
        end: { x: 10, y: 5 },
      });
    });

    it("deleteSelection removes text and resets cursor", () => {
      const cm = createCursorManager();
      cm.primary.x = 8;
      cm.primary.y = 0;
      cm.primary.anchor = { x: 3, y: 0 };

      const lines = ["hello world!"];
      cm.deleteSelection(cm.primary, lines);

      expect(lines[0]).toBe("helrld!");
      expect(cm.primary.x).toBe(3);
      expect(cm.primary.anchor).toBeNull();
    });

    it("deleteSelection across lines joins them", () => {
      const cm = createCursorManager();
      cm.primary.x = 3;
      cm.primary.y = 2;
      cm.primary.anchor = { x: 5, y: 0 };

      const lines = ["hello world", "middle line", "end of text"];
      cm.deleteSelection(cm.primary, lines);

      expect(lines.length).toBe(1);
      expect(lines[0]).toBe("hello of text");
      expect(cm.primary.x).toBe(5);
      expect(cm.primary.y).toBe(0);
    });
  });

  describe("snapshot/restore", () => {
    it("saves and restores complete cursor state", () => {
      const cm = createCursorManager();
      cm.primary.x = 5;
      cm.primary.y = 10;
      cm.primary.anchor = { x: 2, y: 8 };
      cm.addAbove(3, 15);
      cm.scrollX = 4;
      cm.scrollY = 7;

      const snapshot = cm.saveState();

      // change everything
      cm.primary.x = 0;
      cm.primary.y = 0;
      cm.primary.anchor = null;
      cm.clearExtras();
      cm.scrollX = 0;
      cm.scrollY = 0;

      cm.restoreState(snapshot);

      expect(cm.primary.x).toBe(5);
      expect(cm.primary.y).toBe(10);
      expect(cm.primary.anchor!).toEqual({ x: 2, y: 8 });
      expect(cm.count).toBe(2);
      expect(cm.all[1].x).toBe(3);
      expect(cm.all[1].y).toBe(15);
      expect(cm.scrollX).toBe(4);
      expect(cm.scrollY).toBe(7);
    });
  });

  describe("selectNextOccurrence", () => {
    it("selects word at cursor when no selection (cursor inside word)", () => {
      const cm = createCursorManager();
      const lines = ["hello world hello"];
      cm.primary.x = 2; // inside "hello"
      cm.primary.y = 0;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(true);
      expect(cm.count).toBe(1);
      expect(cm.primary.anchor).toEqual({ x: 0, y: 0 });
      expect(cm.primary.x).toBe(5);
      expect(cm.primary.y).toBe(0);
    });

    it("selects word when cursor is right after the word", () => {
      const cm = createCursorManager();
      const lines = ["hello world"];
      cm.primary.x = 5; // right after "hello"
      cm.primary.y = 0;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(true);
      expect(cm.primary.anchor).toEqual({ x: 0, y: 0 });
      expect(cm.primary.x).toBe(5);
    });

    it("returns false when cursor is on non-word char without selection", () => {
      const cm = createCursorManager();
      const lines = [", , ,"];
      cm.primary.x = 2; // on a space between commas, neither side is a word
      cm.primary.y = 0;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(false);
      expect(cm.count).toBe(1);
      expect(cm.primary.anchor).toBeNull();
    });

    it("adds new cursor at next occurrence when selection exists", () => {
      const cm = createCursorManager();
      const lines = ['{ "name": "hello", "other": "hello" }'];
      cm.primary.anchor = { x: 11, y: 0 };
      cm.primary.x = 16; // "hello" selected (first one)
      cm.primary.y = 0;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(true);
      expect(cm.count).toBe(2);
      const second = cm.all[1];
      expect(second.anchor).toEqual({ x: 29, y: 0 });
      expect(second.x).toBe(34);
      expect(second.y).toBe(0);
    });

    it("finds occurrences across multiple lines", () => {
      const cm = createCursorManager();
      const lines = ["foo bar", "baz foo qux", "foo end"];
      // select "foo" on line 0
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 3;
      cm.primary.y = 0;

      cm.selectNextOccurrence(lines);
      expect(cm.count).toBe(2);
      expect(cm.all[1].anchor).toEqual({ x: 4, y: 1 });
      expect(cm.all[1].x).toBe(7);
      expect(cm.all[1].y).toBe(1);

      cm.selectNextOccurrence(lines);
      expect(cm.count).toBe(3);
      expect(cm.all[2].anchor).toEqual({ x: 0, y: 2 });
      expect(cm.all[2].x).toBe(3);
      expect(cm.all[2].y).toBe(2);
    });

    it("wraps around to the beginning when no more occurrences after cursor", () => {
      const cm = createCursorManager();
      const lines = ["foo", "bar", "foo"];
      // select the last "foo"
      cm.primary.anchor = { x: 0, y: 2 };
      cm.primary.x = 3;
      cm.primary.y = 2;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(true);
      expect(cm.count).toBe(2);
      expect(cm.all[1].anchor).toEqual({ x: 0, y: 0 });
      expect(cm.all[1].y).toBe(0);
    });

    it("returns false when needle has no other occurrence", () => {
      const cm = createCursorManager();
      const lines = ["unique only"];
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 6;
      cm.primary.y = 0;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(false);
      expect(cm.count).toBe(1);
    });

    it("skips positions already covered by another cursor", () => {
      const cm = createCursorManager();
      const lines = ["foo foo foo"];
      // primary already has first "foo"
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 3;

      cm.selectNextOccurrence(lines);
      // now cursors at "foo"@0 and "foo"@4
      expect(cm.count).toBe(2);
      expect(cm.all[1].anchor).toEqual({ x: 4, y: 0 });

      cm.selectNextOccurrence(lines);
      // adds "foo"@8
      expect(cm.count).toBe(3);
      expect(cm.all[2].anchor).toEqual({ x: 8, y: 0 });

      // one more press should wrap and find nothing new (all covered)
      const ok = cm.selectNextOccurrence(lines);
      expect(ok).toBe(false);
      expect(cm.count).toBe(3);
    });

    it("returns false for multi-line selection", () => {
      const cm = createCursorManager();
      const lines = ["abc", "def"];
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 3;
      cm.primary.y = 1;

      const ok = cm.selectNextOccurrence(lines);

      expect(ok).toBe(false);
      expect(cm.count).toBe(1);
    });

    it("matches literal substring after first selection (not whole-word)", () => {
      const cm = createCursorManager();
      const lines = ["test tested testing"];
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 4; // "test" selected

      cm.selectNextOccurrence(lines);
      // should find "test" inside "tested"
      expect(cm.count).toBe(2);
      expect(cm.all[1].anchor).toEqual({ x: 5, y: 0 });
      expect(cm.all[1].x).toBe(9);

      cm.selectNextOccurrence(lines);
      // should find "test" inside "testing"
      expect(cm.count).toBe(3);
      expect(cm.all[2].anchor).toEqual({ x: 12, y: 0 });
      expect(cm.all[2].x).toBe(16);
    });

    it("is case-sensitive", () => {
      const cm = createCursorManager();
      const lines = ["Hello hello HELLO"];
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 5; // "Hello"

      const ok = cm.selectNextOccurrence(lines);
      expect(ok).toBe(false);
      expect(cm.count).toBe(1);
    });

    it("searches from the LAST cursor, not primary", () => {
      const cm = createCursorManager();
      const lines = ["foo a foo b foo c foo"];
      // primary has first "foo"
      cm.primary.anchor = { x: 0, y: 0 };
      cm.primary.x = 3;

      cm.selectNextOccurrence(lines); // adds @6
      cm.selectNextOccurrence(lines); // adds @12
      // last cursor is now at @12; next search should start after that
      cm.selectNextOccurrence(lines); // should add @18
      expect(cm.count).toBe(4);
      expect(cm.all[3].anchor).toEqual({ x: 18, y: 0 });
    });
  });

  describe("mergeIntoSelection", () => {
    it("merges multi-cursor into one selection downward", () => {
      const cm = createCursorManager();
      cm.primary.x = 0;
      cm.primary.y = 2;
      cm.addAbove(5, 5);
      cm.addAbove(3, 8);

      cm.mergeIntoSelection("down");

      expect(cm.count).toBe(1);
      expect(cm.primary.anchor).toEqual({ x: 0, y: 2 });
      expect(cm.primary.x).toBe(3);
      expect(cm.primary.y).toBe(8);
    });

    it("merges multi-cursor into one selection upward", () => {
      const cm = createCursorManager();
      cm.primary.x = 0;
      cm.primary.y = 2;
      cm.addAbove(5, 5);
      cm.addAbove(3, 8);

      cm.mergeIntoSelection("up");

      expect(cm.count).toBe(1);
      expect(cm.primary.anchor).toEqual({ x: 3, y: 8 });
      expect(cm.primary.x).toBe(0);
      expect(cm.primary.y).toBe(2);
    });
  });
});
