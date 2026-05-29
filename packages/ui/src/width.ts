// Display-width helpers for terminal rendering. The renderer's cell buffer is
// one column per cell, but emoji and CJK glyphs occupy two columns and
// combining/zero-width marks occupy none. Heuristic ranges (no dependency) —
// covers CJK and the common emoji blocks; not every exotic sequence.

const seg =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Split a string into grapheme clusters (falls back to code points). */
export function graphemes(text: string): string[] {
  if (seg) return Array.from(seg.segment(text), (s) => s.segment);
  return Array.from(text);
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || // zero-width space
    cp === 0x200c || // zero-width non-joiner
    cp === 0x200d || // zero-width joiner
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0xfe00 && cp <= 0xfe0f) // variation selectors
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols + dingbats (✨ ✅ ⚡ …)
    (cp >= 0x2b00 && cp <= 0x2bff) || // misc symbols and arrows
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals … Kangxi
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana … CJK compat
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+
  );
}

/** Display width of a single code point: 0, 1 or 2 columns. */
export function charWidth(codePoint: number): number {
  if (codePoint < 32) return 0;
  if (isZeroWidth(codePoint)) return 0;
  if (isWide(codePoint)) return 2;
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
