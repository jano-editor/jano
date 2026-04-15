import { describe, it, expect } from "bun:test";
import { applyCompletionAtCursors, type CursorLike } from "../completion.ts";

function cursor(x: number, y: number): CursorLike {
  return { x, y, anchor: null };
}

describe("applyCompletionAtCursors", () => {
  it("inserts at a single cursor and moves it to the end of the inserted text", () => {
    const lines = ["foo"];
    const cursors = [cursor(3, 0)];

    applyCompletionAtCursors(lines, cursors, "function");

    expect(lines).toEqual(["function"]);
    expect(cursors[0]).toEqual({ x: 8, y: 0, anchor: null });
  });

  it("replaces the word prefix, not the full word", () => {
    const lines = ["fo bar"];
    const cursors = [cursor(2, 0)]; // after "fo"

    applyCompletionAtCursors(lines, cursors, "foo");

    expect(lines).toEqual(["foo bar"]);
    expect(cursors[0]!.x).toBe(3);
  });

  it("applies at every cursor on different lines", () => {
    const lines = ["foo", "foo", "foo"];
    const cursors = [cursor(3, 0), cursor(3, 1), cursor(3, 2)];

    applyCompletionAtCursors(lines, cursors, "foobar");

    expect(lines).toEqual(["foobar", "foobar", "foobar"]);
    expect(cursors[0]!.x).toBe(6);
    expect(cursors[1]!.x).toBe(6);
    expect(cursors[2]!.x).toBe(6);
  });

  it("applies at multiple cursors on the same line without corrupting positions", () => {
    const lines = ["fo ba fo"];
    //              ^2   ^5  ^8
    const cursors = [cursor(2, 0), cursor(5, 0), cursor(8, 0)];

    applyCompletionAtCursors(lines, cursors, "X");

    // each "fo" becomes "X", each "ba" becomes "X"
    expect(lines).toEqual(["X X X"]);
    // cursors should all end up right after their inserted "X"
    const xs = cursors.map((c) => c.x).sort((a, b) => a - b);
    expect(xs).toEqual([1, 3, 5]);
  });

  it("drops selection anchors on accept", () => {
    const lines = ["foo"];
    const cursors: CursorLike[] = [{ x: 3, y: 0, anchor: { x: 0, y: 0 } }];

    applyCompletionAtCursors(lines, cursors, "function");

    expect(cursors[0]!.anchor).toBeNull();
  });

  it("handles multi-line insertion at a single cursor", () => {
    const lines = ["fo"];
    const cursors = [cursor(2, 0)];

    applyCompletionAtCursors(lines, cursors, "first\nsecond");

    expect(lines).toEqual(["first", "second"]);
    expect(cursors[0]).toEqual({ x: 6, y: 1, anchor: null });
  });

  it("preserves text after the cursor when inserting", () => {
    const lines = ["fo rest"];
    const cursors = [cursor(2, 0)];

    applyCompletionAtCursors(lines, cursors, "foo");

    expect(lines).toEqual(["foo rest"]);
  });

  it("inserts into an empty word (no prefix)", () => {
    const lines = ["hello "];
    const cursors = [cursor(6, 0)];

    applyCompletionAtCursors(lines, cursors, "world");

    expect(lines).toEqual(["hello world"]);
    expect(cursors[0]!.x).toBe(11);
  });
});
