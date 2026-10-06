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

function widthOf(g: string, col: number, tabSize: number): number {
  if (g === "\t") return tabSize - (col % tabSize);
  return controlPicture(g) ? 1 : graphemeWidth(g);
}

// ----- line index -----

// Grapheme k spans string indices starts[k]..starts[k+1] and screen columns cols[k]..cols[k+1].
// The last entry holds line.length and the total width.
interface LineIndex {
  tabSize: number;
  starts: number[];
  cols: number[];
}

// Long lines are indexed once per line string, so render, cursor and status bar
// don't re-segment them several times per frame. Small, since entries of huge lines are big.
const CACHE_MIN_LENGTH = 256;
const CACHE_SIZE = 8;
const cache = new Map<string, LineIndex | null>();

function buildIndex(line: string, tabSize: number): LineIndex {
  const starts: number[] = [];
  const cols: number[] = [];
  let idx = 0;
  let col = 0;
  for (const g of graphemes(line)) {
    starts.push(idx);
    cols.push(col);
    col += widthOf(g, col, tabSize);
    idx += g.length;
  }
  starts.push(idx);
  cols.push(col);
  return { tabSize, starts, cols };
}

/**
 * Index of a line, or null for printable ASCII where index == column.
 * Pass tabSize null when only grapheme boundaries are needed, then any cached index will do.
 */
function lineIndex(line: string, tabSize: number | null): LineIndex | null {
  if (line.length < CACHE_MIN_LENGTH) {
    return SIMPLE.test(line) ? null : buildIndex(line, tabSize ?? 4);
  }

  const hit = cache.get(line);
  if (hit === null) return null; // ascii doesn't depend on tabSize
  if (hit && (tabSize === null || hit.tabSize === tabSize)) return hit;

  const index = SIMPLE.test(line) ? null : buildIndex(line, tabSize ?? 4);
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(line, index);
  return index;
}

/** Smallest k in [0, count] for which pred(k) is true, assuming pred is monotonic. */
function firstTrue(count: number, pred: (k: number) => boolean): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Grapheme k that contains string index idx (0 <= idx < line.length). */
function graphemeAt(ix: LineIndex, idx: number): number {
  return firstTrue(ix.starts.length - 1, (k) => ix.starts[k + 1] > idx);
}

// ----- public api -----

/** Glyphs overlapping screen columns [fromCol, toCol), with their string index and column. */
export function layoutLine(line: string, tabSize: number, fromCol = 0, toCol = Infinity): Glyph[] {
  const glyphs: Glyph[] = [];
  const ix = lineIndex(line, tabSize);

  if (!ix) {
    const end = Math.min(line.length, toCol);
    for (let i = Math.max(0, fromCol); i < end; i++) {
      glyphs.push({ idx: i, col: i, width: 1, text: line[i] });
    }
    return glyphs;
  }

  const count = ix.starts.length - 1;
  // first grapheme that reaches past fromCol
  for (let k = firstTrue(count, (k) => ix.cols[k + 1] > fromCol); k < count; k++) {
    const col = ix.cols[k];
    if (col >= toCol) break;
    const idx = ix.starts[k];
    const width = ix.cols[k + 1] - col;
    const g = line.slice(idx, ix.starts[k + 1]);
    const picture = g === "\t" ? null : controlPicture(g);
    if (g === "\t") glyphs.push({ idx, col, width, text: " " });
    else if (picture) glyphs.push({ idx, col, width, text: picture, control: true });
    else glyphs.push({ idx, col, width, text: g });
  }
  return glyphs;
}

/** Screen column of the string index `idx` (snaps back to the start of a grapheme). */
export function colAt(line: string, idx: number, tabSize: number): number {
  const ix = lineIndex(line, tabSize);
  if (!ix) return Math.max(0, Math.min(idx, line.length));
  if (idx <= 0) return 0;
  if (idx >= line.length) return ix.cols[ix.cols.length - 1];
  return ix.cols[graphemeAt(ix, idx)];
}

/** String index of the grapheme covering screen column `col`, or line.length past the end. */
export function idxAtCol(line: string, col: number, tabSize: number): number {
  const ix = lineIndex(line, tabSize);
  if (!ix) return Math.max(0, Math.min(col, line.length));
  // zero-width graphemes never cover a column, so they are skipped
  return ix.starts[firstTrue(ix.starts.length - 1, (k) => ix.cols[k + 1] > col)];
}

/** Total display width of a line. */
export function lineWidth(line: string, tabSize: number): number {
  const ix = lineIndex(line, tabSize);
  return ix ? ix.cols[ix.cols.length - 1] : line.length;
}

/** Index of the next grapheme boundary after `idx`. */
export function nextBoundary(line: string, idx: number): number {
  if (idx >= line.length) return line.length;
  const ix = lineIndex(line, null);
  if (!ix) return idx + 1;
  return ix.starts[graphemeAt(ix, Math.max(0, idx)) + 1];
}

/** Index of the previous grapheme boundary before `idx`. */
export function prevBoundary(line: string, idx: number): number {
  if (idx <= 0) return 0;
  const ix = lineIndex(line, null);
  if (!ix) return idx - 1;
  return ix.starts[graphemeAt(ix, Math.min(idx, line.length) - 1)];
}

/** Moves idx out of the middle of a grapheme: to its start ("left") or its end ("right"). */
export function snapToBoundary(line: string, idx: number, dir: "left" | "right"): number {
  if (idx <= 0 || idx >= line.length) return idx;
  const ix = lineIndex(line, null);
  if (!ix) return idx;
  const k = graphemeAt(ix, idx);
  if (ix.starts[k] === idx) return idx;
  return dir === "left" ? ix.starts[k] : ix.starts[k + 1];
}

/** Word characters for word jumps, double-click and completion. Unlike \w this includes umlauts and accents. */
export const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
/** Punctuation and symbols: neither a word character nor whitespace. */
export const NON_WORD_CHAR = /[^\p{L}\p{N}\p{M}_\s]/u;
