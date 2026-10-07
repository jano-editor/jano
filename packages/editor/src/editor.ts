import { readFileSync, existsSync, statSync } from "node:fs";
import { writeFileSafely, type WriteMode } from "./safe-write.ts";
import { colAt, nextBoundary, prevBoundary } from "./text-layout.ts";

export type Eol = "\n" | "\r\n";

export interface EditorState {
  lines: string[];
  filePath: string;
  dirty: boolean;
  clipboardParts: string[];
  isNewFile: boolean;
  /** line ending used when saving, detected on load */
  eol: Eol;
  /** the file had bytes that aren't valid UTF-8, saving replaces them with U+FFFD */
  invalidUtf8: boolean;
  /** whether the file started with a UTF-8 BOM, restored on save */
  bom: boolean;
}

const BOM = "\uFEFF";

/** Splits raw file content into lines and detects line ending and BOM. */
export function parseContent(raw: string): { lines: string[]; eol: Eol; bom: boolean } {
  const bom = raw.startsWith(BOM);
  const text = bom ? raw.slice(1) : raw;
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  return {
    // mixed files get normalized to whichever ending is more common
    lines: text.split(/\r?\n/),
    eol: crlf > lf ? "\r\n" : "\n",
    bom,
  };
}

/** Inverse of parseContent: what gets written to disk. */
export function serializeContent(state: Pick<EditorState, "lines" | "eol" | "bom">): string {
  return (state.bom ? BOM : "") + state.lines.join(state.eol);
}

export function createEditor(filePath?: string): EditorState {
  // no argument: untitled new file
  if (!filePath) {
    return {
      lines: [""],
      filePath: "",
      dirty: false,
      clipboardParts: [],
      isNewFile: true,
      eol: "\n",
      bom: false,
      invalidUtf8: false,
    };
  }

  // argument given but file doesn't exist: new file with known path
  if (!existsSync(filePath)) {
    return {
      lines: [""],
      filePath,
      dirty: false,
      clipboardParts: [],
      isNewFile: true,
      eol: "\n",
      bom: false,
      invalidUtf8: false,
    };
  }

  // existing file
  const { text, invalidUtf8 } = readTextFile(filePath);
  const { lines, eol, bom } = parseContent(text);
  return {
    lines,
    filePath,
    dirty: false,
    clipboardParts: [],
    isNewFile: false,
    eol,
    bom,
    invalidUtf8,
  };
}

/** A file that can't be edited. The message is written for the user. */
export class OpenError extends Error {}

// like git: a NUL byte near the start means binary
const BINARY_SNIFF_BYTES = 8000;

/** Reads a file as UTF-8 text. Throws OpenError for folders, missing permissions and binary files. */
export function readTextFile(filePath: string): { text: string; invalidUtf8: boolean } {
  let buf: Buffer;
  try {
    // only regular files: reading a pipe blocks forever, /dev/zero never ends
    const stat = statSync(filePath);
    if (stat.isDirectory()) throw new OpenError(`${filePath} is a directory.`);
    if (!stat.isFile()) {
      throw new OpenError(`${filePath} is not a regular file (device, pipe or socket).`);
    }
    buf = readFileSync(filePath);
  } catch (err) {
    if (err instanceof OpenError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EISDIR") throw new OpenError(`${filePath} is a directory.`);
    if (code === "EACCES" || code === "EPERM") {
      throw new OpenError(`No permission to read ${filePath}. Try sudo.`);
    }
    throw new OpenError(`Could not open ${filePath}: ${(err as Error).message}`);
  }

  // UTF-16 files are full of NUL bytes, say what they are instead of calling them binary
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
    throw new OpenError(`${filePath} is UTF-16 encoded, jano only edits UTF-8.`);
  }
  if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    throw new OpenError(`${filePath} looks like a binary file, jano only edits text.`);
  }

  // ignoreBOM keeps a BOM in the text, so parseContent can detect and restore it
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf),
      invalidUtf8: false,
    };
  } catch {
    return { text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf), invalidUtf8: true };
  }
}

export function saveAs(state: EditorState, filePath: string): WriteMode {
  // write first, so a failed save doesn't leave filePath pointing at the bad target
  const mode = writeFileSafely(filePath, serializeContent(state));
  state.filePath = filePath;
  state.dirty = false;
  state.isNewFile = false;
  return mode;
}

export function insertChar(state: EditorState, x: number, y: number, ch: string): number {
  const line = state.lines[y];
  state.lines[y] = line.substring(0, x) + ch + line.substring(x);
  state.dirty = true;
  return x + ch.length;
}

export function insertNewline(state: EditorState, x: number, y: number): { x: number; y: number } {
  const before = state.lines[y].substring(0, x);
  const after = state.lines[y].substring(x);
  state.lines[y] = before;
  state.lines.splice(y + 1, 0, after);
  state.dirty = true;
  return { x: 0, y: y + 1 };
}

export function deleteCharBack(state: EditorState, x: number, y: number): { x: number; y: number } {
  if (x > 0) {
    // whole grapheme, so emoji and combined characters are never split
    const line = state.lines[y];
    const start = prevBoundary(line, x);
    state.lines[y] = line.substring(0, start) + line.substring(x);
    state.dirty = true;
    return { x: start, y };
  }
  if (y > 0) {
    const newX = state.lines[y - 1].length;
    state.lines[y - 1] += state.lines[y];
    state.lines.splice(y, 1);
    state.dirty = true;
    return { x: newX, y: y - 1 };
  }
  return { x, y };
}

export function deleteWordBack(
  state: EditorState,
  x: number,
  y: number,
  boundaryX: number,
): { x: number; y: number } {
  if (x > 0) {
    const line = state.lines[y];
    state.lines[y] = line.substring(0, boundaryX) + line.substring(x);
    state.dirty = true;
    return { x: boundaryX, y };
  }
  if (y > 0) {
    const newX = state.lines[y - 1].length;
    state.lines[y - 1] += state.lines[y];
    state.lines.splice(y, 1);
    state.dirty = true;
    return { x: newX, y: y - 1 };
  }
  return { x, y };
}

export function deleteWordForward(state: EditorState, x: number, y: number, boundaryX: number) {
  if (x < state.lines[y].length) {
    const line = state.lines[y];
    state.lines[y] = line.substring(0, x) + line.substring(boundaryX);
  } else if (y < state.lines.length - 1) {
    state.lines[y] += state.lines[y + 1];
    state.lines.splice(y + 1, 1);
  }
  state.dirty = true;
}

export function deleteCharForward(state: EditorState, x: number, y: number) {
  if (x < state.lines[y].length) {
    const line = state.lines[y];
    state.lines[y] = line.substring(0, x) + line.substring(nextBoundary(line, x));
  } else if (y < state.lines.length - 1) {
    state.lines[y] += state.lines[y + 1];
    state.lines.splice(y + 1, 1);
  }
  state.dirty = true;
}

export function insertTab(
  state: EditorState,
  x: number,
  y: number,
  tabSize = 2,
  insertSpaces = true,
): number {
  const line = state.lines[y];
  // spaces fill up to the next tab stop, measured in screen columns (emoji count double)
  const size = Math.max(1, Math.floor(tabSize) || 1);
  const insert = insertSpaces ? " ".repeat(size - (colAt(line, x, size) % size)) : "\t";
  state.lines[y] = line.substring(0, x) + insert + line.substring(x);
  state.dirty = true;
  return x + insert.length;
}

export function moveLinesUp(state: EditorState, startLine: number, endLine: number): boolean {
  if (startLine <= 0) return false;
  const moved = state.lines.splice(startLine, endLine - startLine + 1);
  state.lines.splice(startLine - 1, 0, ...moved);
  state.dirty = true;
  return true;
}

export function moveLinesDown(state: EditorState, startLine: number, endLine: number): boolean {
  if (endLine >= state.lines.length - 1) return false;
  const moved = state.lines.splice(startLine, endLine - startLine + 1);
  state.lines.splice(startLine + 1, 0, ...moved);
  state.dirty = true;
  return true;
}

export function cutLine(state: EditorState, y: number): { clipText: string; newY: number } {
  const clipText = state.lines[y] + "\n";
  state.lines.splice(y, 1);
  if (state.lines.length === 0) state.lines = [""];
  const newY = Math.min(y, state.lines.length - 1);
  state.dirty = true;
  return { clipText, newY };
}

export function pasteText(
  state: EditorState,
  x: number,
  y: number,
  text: string,
): { x: number; y: number } {
  const pasteLines = text.split("\n");

  if (pasteLines.length === 1) {
    const line = state.lines[y];
    state.lines[y] = line.substring(0, x) + pasteLines[0] + line.substring(x);
    state.dirty = true;
    return { x: x + pasteLines[0].length, y };
  }

  const before = state.lines[y].substring(0, x);
  const after = state.lines[y].substring(x);
  state.lines[y] = before + pasteLines[0];
  for (let i = 1; i < pasteLines.length - 1; i++) {
    state.lines.splice(y + i, 0, pasteLines[i]);
  }
  const lastLine = pasteLines[pasteLines.length - 1];
  state.lines.splice(y + pasteLines.length - 1, 0, lastLine + after);
  state.dirty = true;
  return { x: lastLine.length, y: y + pasteLines.length - 1 };
}
