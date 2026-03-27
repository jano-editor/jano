import { describe, it, expect } from "vitest";
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
      expect(cm.primary.anchor).toEqual({ x: 2, y: 8 });
      expect(cm.count).toBe(2);
      expect(cm.all[1].x).toBe(3);
      expect(cm.all[1].y).toBe(15);
      expect(cm.scrollX).toBe(4);
      expect(cm.scrollY).toBe(7);
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
