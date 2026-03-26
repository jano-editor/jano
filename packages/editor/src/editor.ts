import { readFileSync, writeFileSync, existsSync } from "node:fs";

export interface EditorState {
  lines: string[];
  filePath: string;
  dirty: boolean;
  clipboardParts: string[];
  isNewFile: boolean;
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
    };
  }

  // existing file
  const lines = readFileSync(filePath, "utf8").split("\n");
  return {
    lines,
    filePath,
    dirty: false,
    clipboardParts: [],
    isNewFile: false,
  };
}

export function save(state: EditorState): boolean {
  if (!state.filePath) return false;
  writeFileSync(state.filePath, state.lines.join("\n"), "utf8");
  state.dirty = false;
  state.isNewFile = false;
  return true;
}

export function saveAs(state: EditorState, filePath: string) {
  state.filePath = filePath;
  writeFileSync(filePath, state.lines.join("\n"), "utf8");
  state.dirty = false;
  state.isNewFile = false;
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
    const line = state.lines[y];
    state.lines[y] = line.substring(0, x - 1) + line.substring(x);
    state.dirty = true;
    return { x: x - 1, y };
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
    state.lines[y] = line.substring(0, x) + line.substring(x + 1);
  } else if (y < state.lines.length - 1) {
    state.lines[y] += state.lines[y + 1];
    state.lines.splice(y + 1, 1);
  }
  state.dirty = true;
}

export function insertTab(state: EditorState, x: number, y: number): number {
  const line = state.lines[y];
  state.lines[y] = line.substring(0, x) + "  " + line.substring(x);
  state.dirty = true;
  return x + 2;
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
