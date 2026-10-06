import { graphemes, graphemeWidth } from "@jano-editor/ui";

// Maps between string indices (what the buffer and cursors use) and screen columns
// (what the terminal shows). Tabs expand to the next tab stop, emoji and CJK take two
// columns, and other control characters are shown as one-column symbols.

export interface Glyph {
  /** string index where the grapheme starts */
  idx: number;
  /** screen column where it starts */
  col: number;
  /** columns it occupies */
  width: number;
  /** what to draw */
  text: string;
  /** set for control characters drawn as a symbol */
  control?: true;
}

// printable ASCII only: index == column, no segmentation needed
const SIMPLE = /^[\x20-\x7e]*$/;

/** Controls are drawn as their Unicode "control picture" (\r -> ␍) so they never reach the terminal raw. */
function controlPicture(g: string): string | null {
  const cp = g.codePointAt(0) ?? 0;
  if (cp < 0x20) return String.fromCodePoint(0x2400 + cp);
  if (cp === 0x7f) return "␡";
  return null;
}

/** Splits a line into drawable glyphs with their screen columns. */
export function layoutLine(line: string, tabSize: number): Glyph[] {
  const glyphs: Glyph[] = [];
  if (SIMPLE.test(line)) {
    for (let i = 0; i < line.length; i++) glyphs.push({ idx: i, col: i, width: 1, text: line[i] });
    return glyphs;
  }

  let idx = 0;
  let col = 0;
  for (const g of graphemes(line)) {
    let glyph: Glyph;
    if (g === "\t") {
      glyph = { idx, col, width: tabSize - (col % tabSize), text: " " };
    } else {
      const picture = controlPicture(g);
      glyph = picture
        ? { idx, col, width: 1, text: picture, control: true }
        : { idx, col, width: graphemeWidth(g), text: g };
    }
    glyphs.push(glyph);
    idx += g.length;
    col += glyph.width;
  }
  return glyphs;
}

/** Screen column of the string index `idx` (snaps back to the start of a grapheme). */
export function colAt(line: string, idx: number, tabSize: number): number {
  if (SIMPLE.test(line)) return Math.max(0, Math.min(idx, line.length));
  const glyphs = layoutLine(line, tabSize);
  let prev: Glyph | null = null;
  for (const g of glyphs) {
    if (g.idx === idx) return g.col;
    // idx points into the middle of the previous grapheme
    if (g.idx > idx) return prev ? prev.col : 0;
    prev = g;
  }
  if (!prev) return 0;
  return idx < line.length ? prev.col : prev.col + prev.width;
}

/** String index of the grapheme covering screen column `col`, or line.length past the end. */
export function idxAtCol(line: string, col: number, tabSize: number): number {
  if (SIMPLE.test(line)) return Math.max(0, Math.min(col, line.length));
  for (const g of layoutLine(line, tabSize)) {
    if (col < g.col + g.width) return g.idx;
  }
  return line.length;
}

/** Total display width of a line. */
export function lineWidth(line: string, tabSize: number): number {
  if (SIMPLE.test(line)) return line.length;
  const glyphs = layoutLine(line, tabSize);
  const last = glyphs[glyphs.length - 1];
  return last ? last.col + last.width : 0;
}

/** Index of the next grapheme boundary after `idx`. */
export function nextBoundary(line: string, idx: number): number {
  if (idx >= line.length) return line.length;
  if (SIMPLE.test(line)) return idx + 1;
  let pos = 0;
  for (const g of graphemes(line)) {
    pos += g.length;
    if (pos > idx) return pos;
  }
  return line.length;
}

/** Index of the previous grapheme boundary before `idx`. */
export function prevBoundary(line: string, idx: number): number {
  if (idx <= 0) return 0;
  if (SIMPLE.test(line)) return idx - 1;
  let pos = 0;
  for (const g of graphemes(line)) {
    if (pos + g.length >= idx) return pos;
    pos += g.length;
  }
  return pos;
}
