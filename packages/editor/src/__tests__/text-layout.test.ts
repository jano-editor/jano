import { describe, it, expect } from "bun:test";
import {
  layoutLine,
  colAt,
  idxAtCol,
  lineWidth,
  nextBoundary,
  prevBoundary,
} from "../text-layout.ts";

const EMOJI = "😀"; // 2 UTF-16 units, 2 columns
const FAMILY = "👨‍👩‍👧"; // one grapheme, 8 UTF-16 units, 2 columns

describe("layoutLine", () => {
  it("maps plain ascii 1:1", () => {
    expect(layoutLine("ab", 4)).toEqual([
      { idx: 0, col: 0, width: 1, text: "a" },
      { idx: 1, col: 1, width: 1, text: "b" },
    ]);
  });

  it("expands tabs to the next tab stop", () => {
    const glyphs = layoutLine("a\tb", 4);
    expect(glyphs[1]).toEqual({ idx: 1, col: 1, width: 3, text: " " });
    expect(glyphs[2].col).toBe(4);
  });

  it("gives emoji two columns and keeps clusters together", () => {
    const glyphs = layoutLine(`a${FAMILY}b`, 4);
    expect(glyphs).toHaveLength(3);
    expect(glyphs[1]).toMatchObject({ idx: 1, col: 1, width: 2 });
    expect(glyphs[2]).toMatchObject({ idx: 1 + FAMILY.length, col: 3 });
  });

  it("shows control characters as symbols", () => {
    expect(layoutLine("a\r", 4)[1]).toEqual({ idx: 1, col: 1, width: 1, text: "␍", control: true });
  });
});

describe("colAt / idxAtCol", () => {
  const line = `\t${EMOJI}x`; // tab 0-3, emoji 4-5, x at 6

  it("converts index to column", () => {
    expect(colAt(line, 0, 4)).toBe(0);
    expect(colAt(line, 1, 4)).toBe(4);
    expect(colAt(line, 3, 4)).toBe(6);
    expect(colAt(line, 4, 4)).toBe(7);
  });

  it("snaps an index inside a surrogate pair back to its start", () => {
    expect(colAt(line, 2, 4)).toBe(4);
  });

  it("converts column to index", () => {
    expect(idxAtCol(line, 2, 4)).toBe(0); // inside the tab
    expect(idxAtCol(line, 5, 4)).toBe(1); // right half of the emoji
    expect(idxAtCol(line, 6, 4)).toBe(3);
    expect(idxAtCol(line, 99, 4)).toBe(line.length);
  });

  it("fast path for ascii", () => {
    expect(colAt("hello", 3, 4)).toBe(3);
    expect(idxAtCol("hello", 9, 4)).toBe(5);
  });

  it("lineWidth sums display columns", () => {
    expect(lineWidth(line, 4)).toBe(7);
    expect(lineWidth("abc", 4)).toBe(3);
    expect(lineWidth("", 4)).toBe(0);
  });
});

describe("grapheme boundaries", () => {
  const line = `a${FAMILY}b`;

  it("steps over a whole cluster", () => {
    expect(nextBoundary(line, 1)).toBe(1 + FAMILY.length);
    expect(prevBoundary(line, 1 + FAMILY.length)).toBe(1);
  });

  it("steps over surrogate pairs", () => {
    expect(nextBoundary(EMOJI, 0)).toBe(2);
    expect(prevBoundary(EMOJI, 2)).toBe(0);
  });

  it("clamps at the line ends", () => {
    expect(nextBoundary("ab", 2)).toBe(2);
    expect(prevBoundary("ab", 0)).toBe(0);
  });
});
