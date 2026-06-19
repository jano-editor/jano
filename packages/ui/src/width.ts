// Display-width helpers for terminal rendering. The cell buffer is one column per cell, but East
// Asian Wide/Fullwidth and emoji glyphs occupy two columns while combining/format marks occupy none.
// Widths come from a table generated from the Unicode Character Database (scripts/gen-width.ts →
// width-data.ts) — the authoritative approach wcwidth / unicode-width use. So narrow text symbols
// (✓ ✗ ★ …) stay 1 column and only real emoji / CJK stay 2, for every code point, not block-by-block.

import { WIDE, ZERO } from "./width-data.ts";

const seg =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Split a string into grapheme clusters (falls back to code points). */
export function graphemes(text: string): string[] {
  if (seg) return Array.from(seg.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** True if `cp` lies inside a flat, sorted, inclusive [start, end, …] range list. */
function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = (ranges.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Display width of a single code point: 0, 1 or 2 columns. */
export function charWidth(codePoint: number): number {
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0; // C0 / C1 controls
  if (inRanges(ZERO, codePoint)) return 0;
  if (inRanges(WIDE, codePoint)) return 2;
  return 1;
}

/** Display width of a grapheme cluster (based on its leading code point). */
export function graphemeWidth(grapheme: string): number {
  return charWidth(grapheme.codePointAt(0) ?? 0);
}

/** Total display width of a string in terminal columns. */
export function stringWidth(text: string): number {
  let width = 0;
  for (const g of graphemes(text)) width += graphemeWidth(g);
  return width;
}

/** Truncate a string to at most `maxColumns` display columns. */
export function sliceWidth(text: string, maxColumns: number): string {
  let width = 0;
  let out = "";
  for (const g of graphemes(text)) {
    const gw = graphemeWidth(g);
    if (width + gw > maxColumns) break;
    out += g;
    width += gw;
  }
  return out;
}
