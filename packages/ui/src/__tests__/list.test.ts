import { describe, it, expect } from "bun:test";
import { listMoveUp, listMoveDown, type ListItem, type ListState } from "../list.ts";

const item = (label: string, disabled = false): ListItem => ({
  label,
  value: label,
  disabled,
});

const state = (selectedIndex: number, scrollOffset = 0): ListState => ({
  selectedIndex,
  scrollOffset,
});

describe("list navigation", () => {
  describe("backwards compatibility", () => {
    it("listMoveDown with itemCount number still works", () => {
      const next = listMoveDown(state(0), 5, 10);
      expect(next.selectedIndex).toBe(1);
    });

    it("listMoveUp with no items still works", () => {
      const next = listMoveUp(state(2));
      expect(next.selectedIndex).toBe(1);
    });

    it("listMoveDown stops at last item", () => {
      const next = listMoveDown(state(4), 5, 10);
      expect(next.selectedIndex).toBe(4);
    });

    it("listMoveUp stops at first item", () => {
      const next = listMoveUp(state(0));
      expect(next.selectedIndex).toBe(0);
    });
  });

  describe("disabled item skipping", () => {
    it("listMoveDown skips a single disabled item", () => {
      const items = [item("a"), item("b", true), item("c")];
      const next = listMoveDown(state(0), items, 10);
      expect(next.selectedIndex).toBe(2);
    });

    it("listMoveDown skips multiple consecutive disabled items", () => {
      const items = [item("a"), item("b", true), item("c", true), item("d")];
      const next = listMoveDown(state(0), items, 10);
      expect(next.selectedIndex).toBe(3);
    });

    it("listMoveUp skips a single disabled item", () => {
      const items = [item("a"), item("b", true), item("c")];
      const next = listMoveUp(state(2), items);
      expect(next.selectedIndex).toBe(0);
    });

    it("listMoveUp skips multiple consecutive disabled items", () => {
      const items = [item("a"), item("b", true), item("c", true), item("d")];
      const next = listMoveUp(state(3), items);
      expect(next.selectedIndex).toBe(0);
    });

    it("listMoveDown stays put when only disabled items follow", () => {
      const items = [item("a"), item("b", true), item("c", true)];
      const next = listMoveDown(state(0), items, 10);
      expect(next.selectedIndex).toBe(0);
    });

    it("listMoveUp stays put when only disabled items precede", () => {
      const items = [item("a", true), item("b", true), item("c")];
      const next = listMoveUp(state(2), items);
      expect(next.selectedIndex).toBe(2);
    });

    it("listMoveDown updates scrollOffset when needed", () => {
      const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
      const next = listMoveDown(state(2, 0), items, 3);
      expect(next.selectedIndex).toBe(3);
      expect(next.scrollOffset).toBe(1);
    });

    it("listMoveUp updates scrollOffset when needed", () => {
      const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
      const next = listMoveUp(state(2, 2), items);
      expect(next.selectedIndex).toBe(1);
      expect(next.scrollOffset).toBe(1);
    });
  });
});
