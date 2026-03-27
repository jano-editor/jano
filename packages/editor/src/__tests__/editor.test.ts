import { describe, it, expect } from "vitest";
import {
  createEditor,
  insertChar,
  insertNewline,
  deleteCharBack,
  deleteCharForward,
  deleteWordBack,
  pasteText,
  moveLinesUp,
  moveLinesDown,
} from "../editor.ts";
import { wordBoundaryLeft } from "../cursor-manager.ts";

function makeEditor(lines: string[]) {
  const e = createEditor();
  e.lines = lines;
  return e;
}

describe("editor operations", () => {
  describe("insertChar", () => {
    it("inserts at position and returns new cursor x", () => {
      const e = makeEditor(["hello"]);
      const newX = insertChar(e, 3, 0, "X");
      expect(e.lines[0]).toBe("helXlo");
      expect(newX).toBe(4);
      expect(e.dirty).toBe(true);
    });

    it("inserts multi-byte unicode", () => {
      const e = makeEditor(["abc"]);
      const newX = insertChar(e, 1, 0, "ü");
      expect(e.lines[0]).toBe("aübc");
      expect(newX).toBe(2);
    });
  });

  describe("deleteCharBack", () => {
    it("at line start joins with previous line", () => {
      const e = makeEditor(["hello", "world"]);
      const pos = deleteCharBack(e, 0, 1);
      expect(e.lines).toEqual(["helloworld"]);
      expect(pos).toEqual({ x: 5, y: 0 });
    });

    it("at 0,0 does nothing", () => {
      const e = makeEditor(["abc"]);
      const pos = deleteCharBack(e, 0, 0);
      expect(e.lines).toEqual(["abc"]);
      expect(pos).toEqual({ x: 0, y: 0 });
    });
  });

  describe("deleteCharForward", () => {
    it("at line end joins with next line", () => {
      const e = makeEditor(["hello", "world"]);
      deleteCharForward(e, 5, 0);
      expect(e.lines).toEqual(["helloworld"]);
    });

    it("at last position of last line does nothing", () => {
      const e = makeEditor(["abc"]);
      deleteCharForward(e, 3, 0);
      expect(e.lines).toEqual(["abc"]);
    });
  });

  describe("insertNewline", () => {
    it("splits line at cursor", () => {
      const e = makeEditor(["hello world"]);
      const pos = insertNewline(e, 5, 0);
      expect(e.lines).toEqual(["hello", " world"]);
      expect(pos).toEqual({ x: 0, y: 1 });
    });

    it("at line start creates empty line above", () => {
      const e = makeEditor(["hello"]);
      const pos = insertNewline(e, 0, 0);
      expect(e.lines).toEqual(["", "hello"]);
      expect(pos).toEqual({ x: 0, y: 1 });
    });
  });

  describe("pasteText", () => {
    it("single line paste inserts inline", () => {
      const e = makeEditor(["ab"]);
      const pos = pasteText(e, 1, 0, "XY");
      expect(e.lines).toEqual(["aXYb"]);
      expect(pos).toEqual({ x: 3, y: 0 });
    });

    it("multi-line paste splits and joins correctly", () => {
      const e = makeEditor(["abcd"]);
      const pos = pasteText(e, 2, 0, "X\nY\nZ");
      expect(e.lines).toEqual(["abX", "Y", "Zcd"]);
      expect(pos).toEqual({ x: 1, y: 2 });
    });
  });

  describe("deleteWordBack", () => {
    it("deletes word to boundary", () => {
      const e = makeEditor(["hello world"]);
      const boundary = wordBoundaryLeft("hello world", 11);
      const pos = deleteWordBack(e, 11, 0, boundary);
      expect(e.lines).toEqual(["hello "]);
      expect(pos).toEqual({ x: 6, y: 0 });
    });
  });

  describe("moveLinesUp/Down", () => {
    it("moves line up", () => {
      const e = makeEditor(["a", "b", "c"]);
      const ok = moveLinesUp(e, 2, 2);
      expect(ok).toBe(true);
      expect(e.lines).toEqual(["a", "c", "b"]);
    });

    it("cannot move first line up", () => {
      const e = makeEditor(["a", "b"]);
      const ok = moveLinesUp(e, 0, 0);
      expect(ok).toBe(false);
    });

    it("moves range down", () => {
      const e = makeEditor(["a", "b", "c", "d"]);
      const ok = moveLinesDown(e, 1, 2);
      expect(ok).toBe(true);
      expect(e.lines).toEqual(["a", "d", "b", "c"]);
    });
  });
});
