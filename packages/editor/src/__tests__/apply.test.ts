import { describe, it, expect } from "bun:test";
import { applyEditResult } from "../plugins/apply.ts";
import { createCursorManager } from "../cursor-manager.ts";
import type { EditorState } from "../editor.ts";

function makeEditor(lines: string[]): EditorState {
  return { lines, filePath: "test", dirty: false, clipboardParts: [], isNewFile: false };
}

describe("applyEditResult", () => {
  it("replaceAll swaps entire document", () => {
    const e = makeEditor(["old", "content"]);
    const cm = createCursorManager();
    applyEditResult({ replaceAll: ["new", "stuff", "here"] }, e, cm);
    expect(e.lines).toEqual(["new", "stuff", "here"]);
    expect(e.dirty).toBe(true);
  });

  it("replaceAll with identical content does not set dirty", () => {
    const e = makeEditor(["same", "content"]);
    const cm = createCursorManager();
    applyEditResult({ replaceAll: ["same", "content"] }, e, cm);
    expect(e.dirty).toBe(false);
  });

  it("single-line edit inserts text", () => {
    const e = makeEditor(["hello world"]);
    const cm = createCursorManager();
    applyEditResult(
      {
        edits: [
          {
            range: { start: { line: 0, col: 5 }, end: { line: 0, col: 5 } },
            text: " beautiful",
          },
        ],
      },
      e,
      cm,
    );
    expect(e.lines[0]).toBe("hello beautiful world");
  });

  it("single-line edit replaces text", () => {
    const e = makeEditor(["hello world"]);
    const cm = createCursorManager();
    applyEditResult(
      {
        edits: [
          {
            range: { start: { line: 0, col: 0 }, end: { line: 0, col: 5 } },
            text: "goodbye",
          },
        ],
      },
      e,
      cm,
    );
    expect(e.lines[0]).toBe("goodbye world");
  });

  it("multi-line edit joins lines", () => {
    const e = makeEditor(["aaa", "bbb", "ccc"]);
    const cm = createCursorManager();
    applyEditResult(
      {
        edits: [
          {
            range: { start: { line: 0, col: 2 }, end: { line: 2, col: 1 } },
            text: "X",
          },
        ],
      },
      e,
      cm,
    );
    expect(e.lines).toEqual(["aaXcc"]);
  });

  it("multiple edits applied bottom-up preserve positions", () => {
    const e = makeEditor(["aaa", "bbb", "ccc"]);
    const cm = createCursorManager();
    applyEditResult(
      {
        edits: [
          { range: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } }, text: "1" },
          { range: { start: { line: 2, col: 0 }, end: { line: 2, col: 0 } }, text: "3" },
        ],
      },
      e,
      cm,
    );
    // bottom edit first, then top — both positions stay valid
    expect(e.lines).toEqual(["1aaa", "bbb", "3ccc"]);
  });

  it("cursors in result update target cursor", () => {
    const e = makeEditor(Array.from({ length: 6 }, () => "0123456789ab"));
    const cm = createCursorManager();
    cm.primary.x = 0;
    cm.primary.y = 0;

    applyEditResult(
      {
        cursors: [{ position: { line: 5, col: 10 }, anchor: null }],
      },
      e,
      cm,
    );

    expect(cm.primary.x).toBe(10);
    expect(cm.primary.y).toBe(5);
  });

  it("cursors in result update specific target cursor", () => {
    const e = makeEditor(["aaa", "bbb"]);
    const cm = createCursorManager();
    cm.addAbove(0, 1);
    const extra = cm.all[1];

    applyEditResult(
      {
        cursors: [{ position: { line: 1, col: 3 }, anchor: null }],
      },
      e,
      cm,
      extra,
    );

    // primary should not have moved
    expect(cm.primary.x).toBe(0);
    expect(cm.primary.y).toBe(0);
    // extra cursor should be updated
    expect(extra.x).toBe(3);
    expect(extra.y).toBe(1);
  });
});

describe("applyEditResult with invalid plugin results", () => {
  it("clamps edits outside the buffer instead of crashing", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    applyEditResult(
      { edits: [{ range: { start: { line: 5, col: 99 }, end: { line: 5, col: 99 } }, text: "!" }] },
      e,
      cm,
    );
    expect(e.lines).toEqual(["abc!"]);
  });

  it("swaps reversed ranges", () => {
    const e = makeEditor(["hello"]);
    const cm = createCursorManager();
    applyEditResult(
      { edits: [{ range: { start: { line: 0, col: 4 }, end: { line: 0, col: 1 } }, text: "" }] },
      e,
      cm,
    );
    expect(e.lines).toEqual(["ho"]);
  });

  it("keeps one empty line for an empty replaceAll", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    applyEditResult({ replaceAll: [] }, e, cm);
    expect(e.lines).toEqual([""]);
  });

  it("ignores a replaceAll that is not a string array", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    applyEditResult({ replaceAll: [1, 2] as unknown as string[] }, e, cm);
    expect(e.lines).toEqual(["abc"]);
    expect(e.dirty).toBe(false);
  });

  it("skips malformed edits and applies valid ones", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    const edits = [
      { range: null, text: "x" },
      { range: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } }, text: ">" },
    ] as unknown as NonNullable<Parameters<typeof applyEditResult>[0]["edits"]>;
    applyEditResult({ edits }, e, cm);
    expect(e.lines).toEqual([">abc"]);
  });

  it("skips edits with non-numeric positions instead of clamping them", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    const edits = [
      { range: { start: { line: "x", col: 0 }, end: { line: 0, col: 0 } }, text: "!" },
    ] as unknown as NonNullable<Parameters<typeof applyEditResult>[0]["edits"]>;
    applyEditResult({ edits }, e, cm);
    expect(e.lines).toEqual(["abc"]);
    expect(e.dirty).toBe(false);
  });

  it("ignores edits that are not an array", () => {
    const e = makeEditor(["abc"]);
    const cm = createCursorManager();
    const edits = { range: null, text: "x" } as unknown as [];
    expect(() => applyEditResult({ edits }, e, cm)).not.toThrow();
    expect(e.lines).toEqual(["abc"]);
  });

  it("clamps cursors into the buffer", () => {
    const e = makeEditor(["ab", "c"]);
    const cm = createCursorManager();
    applyEditResult(
      { cursors: [{ position: { line: 10, col: 10 }, anchor: { line: -1, col: -1 } }] },
      e,
      cm,
    );
    expect([cm.primary.x, cm.primary.y]).toEqual([1, 1]);
    expect(cm.primary.anchor).toEqual({ x: 0, y: 0 });
  });
});
