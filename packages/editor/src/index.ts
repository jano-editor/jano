#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createScreen, createDraw } from '@jano/ui';
import { parseKey } from './keypress.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: jano <file>');
  process.exit(1);
}

let lines: string[];
try {
  lines = readFileSync(filePath, 'utf8').split('\n');
} catch {
  console.error(`Cannot open: ${filePath}`);
  process.exit(1);
}

const screen = createScreen();
const draw = createDraw(screen);

// cursor position in the document
let cursorX = 0;
let cursorY = 0;

// scroll offset
let scrollX = 0;
let scrollY = 0;

// track unsaved changes
let dirty = false;

// clipboard (plain text)
let clipboardText = '';

// selection anchor (where shift+arrow started)
interface Pos { x: number; y: number; }
let selAnchor: Pos | null = null;

// line number gutter width
function gutterWidth(): number {
  return String(lines.length).length + 1;
}

// shortcut hints displayed at the bottom
const shortcuts = [
  ['^Q', 'Exit'],
  ['^O', 'Save'],
  ['^X', 'Cut'],
  ['^V', 'Paste'],
  ['^W', 'Search'],
  ['^G', 'Help'],
];

// get ordered selection range (start always before end)
function getSelection(): { start: Pos; end: Pos } | null {
  if (!selAnchor) return null;
  const a = selAnchor;
  const b = { x: cursorX, y: cursorY };
  if (a.y < b.y || (a.y === b.y && a.x <= b.x)) {
    return { start: a, end: b };
  }
  return { start: b, end: a };
}

// extract selected text from lines
function getSelectedText(sel: { start: Pos; end: Pos }): string {
  if (sel.start.y === sel.end.y) {
    return lines[sel.start.y].substring(sel.start.x, sel.end.x);
  }
  const parts: string[] = [];
  parts.push(lines[sel.start.y].substring(sel.start.x));
  for (let y = sel.start.y + 1; y < sel.end.y; y++) {
    parts.push(lines[y]);
  }
  parts.push(lines[sel.end.y].substring(0, sel.end.x));
  return parts.join('\n');
}

// delete selected text and return cursor to selection start
function deleteSelection(sel: { start: Pos; end: Pos }) {
  if (sel.start.y === sel.end.y) {
    const line = lines[sel.start.y];
    lines[sel.start.y] = line.substring(0, sel.start.x) + line.substring(sel.end.x);
  } else {
    const before = lines[sel.start.y].substring(0, sel.start.x);
    const after = lines[sel.end.y].substring(sel.end.x);
    lines[sel.start.y] = before + after;
    lines.splice(sel.start.y + 1, sel.end.y - sel.start.y);
  }
  cursorX = sel.start.x;
  cursorY = sel.start.y;
  selAnchor = null;
  dirty = true;
}

// check if a cell is inside the selection
function isSelected(lineIdx: number, colIdx: number): boolean {
  const sel = getSelection();
  if (!sel) return false;
  if (lineIdx < sel.start.y || lineIdx > sel.end.y) return false;
  if (lineIdx === sel.start.y && colIdx < sel.start.x) return false;
  if (lineIdx === sel.end.y && colIdx >= sel.end.x) return false;
  return true;
}

function render() {
  draw.clear();

  const w = screen.width;
  const h = screen.height;
  const gw = gutterWidth();

  // layout: row 0 = title bar, row 1..h-4 = content, h-3 = status, h-2 = separator, h-1 = shortcuts
  const contentTop = 1;
  const contentBottom = h - 4;
  const viewH = contentBottom - contentTop + 1;
  const viewW = w - 2 - gw; // -2 for left/right border

  // outer border
  draw.rect(0, 0, w, h - 1, { fg: [80, 80, 80], border: 'round' });

  // title bar
  const title = ` jano — ${filePath} `;
  const titleX = Math.floor((w - title.length) / 2);
  draw.text(titleX, 0, title, { fg: [255, 255, 100] });

  // file content
  for (let y = 0; y < viewH; y++) {
    const lineIdx = y + scrollY;
    if (lineIdx >= lines.length) break;

    // line number
    const lineNum = String(lineIdx + 1).padStart(gw - 1, ' ') + ' ';
    draw.text(1, contentTop + y, lineNum, { fg: [100, 100, 100] });

    // line content (char by char for selection highlight)
    const line = lines[lineIdx];
    for (let col = 0; col < viewW; col++) {
      const charIdx = col + scrollX;
      if (charIdx >= line.length) break;
      const ch = line[charIdx];
      if (isSelected(lineIdx, charIdx)) {
        draw.char(1 + gw + col, contentTop + y, ch, { fg: [255, 255, 255], bg: [60, 100, 180] });
      } else {
        draw.char(1 + gw + col, contentTop + y, ch);
      }
    }
  }

  // status bar (inside border)
  const statusY = h - 3;
  draw.line(1, statusY, w - 2, statusY, { fg: [80, 80, 80] });
  const modified = dirty ? ' [modified]' : '';
  const status = ` Ln ${cursorY + 1}, Col ${cursorX + 1}  ${lines.length} lines${modified}`;
  draw.text(2, statusY, status, { fg: [200, 200, 200] });

  // shortcut help (bottom row, outside border)
  const helpY = h - 1;
  let helpX = 0;
  const pairWidth = Math.floor(w / shortcuts.length);
  for (const [key, label] of shortcuts) {
    draw.text(helpX, helpY, key, { fg: [0, 0, 0], bg: [200, 200, 200] });
    draw.text(helpX + key.length, helpY, ` ${label}`, { fg: [150, 150, 150] });
    helpX += pairWidth;
  }

  draw.flush();

  // show cursor at correct position
  const screenCursorX = 1 + gw + (cursorX - scrollX);
  const screenCursorY = contentTop + (cursorY - scrollY);
  screen.moveTo(screenCursorX, screenCursorY);
  screen.showCursor();
}

function ensureCursorVisible() {
  const viewH = screen.height - 4 - 1 + 1; // contentBottom - contentTop + 1
  const viewW = screen.width - 2 - gutterWidth();

  if (cursorY < scrollY) scrollY = cursorY;
  if (cursorY >= scrollY + viewH) scrollY = cursorY - viewH + 1;
  if (cursorX < scrollX) scrollX = cursorX;
  if (cursorX >= scrollX + viewW) scrollX = cursorX - viewW + 1;
}

function clampCursor() {
  if (cursorY < 0) cursorY = 0;
  if (cursorY >= lines.length) cursorY = lines.length - 1;

  const lineLen = lines[cursorY].length;
  if (cursorX < 0) cursorX = 0;
  if (cursorX > lineLen) cursorX = lineLen;
}

function handleKey(data: Buffer) {
  const key = parseKey(data);

  // shift+arrow: start or extend selection
  if (key.shift && ['up', 'down', 'left', 'right', 'home', 'end'].includes(key.name)) {
    if (!selAnchor) selAnchor = { x: cursorX, y: cursorY };

    switch (key.name) {
      case 'up': cursorY--; break;
      case 'down': cursorY++; break;
      case 'left': cursorX--; break;
      case 'right': cursorX++; break;
      case 'home': cursorX = 0; break;
      case 'end': cursorX = lines[cursorY].length; break;
    }

    clampCursor();
    // collapse if cursor returned to anchor
    if (selAnchor && cursorX === selAnchor.x && cursorY === selAnchor.y) {
      selAnchor = null;
    }
    ensureCursorVisible();
    render();
    return;
  }

  // ctrl shortcuts
  if (key.ctrl) {
    switch (key.name) {
      case 'q':
        screen.leave();
        process.exit(0);
      case 'o':
        writeFileSync(filePath, lines.join('\n'), 'utf8');
        dirty = false;
        break;
      case 'c': {
        // copy selection
        const sel = getSelection();
        if (sel) {
          clipboardText = getSelectedText(sel);
          selAnchor = null;
        }
        break;
      }
      case 'x': {
        const sel = getSelection();
        if (sel) {
          // cut selection
          clipboardText = getSelectedText(sel);
          deleteSelection(sel);
        } else {
          // no selection: cut entire line
          clipboardText = lines[cursorY] + '\n';
          lines.splice(cursorY, 1);
          if (lines.length === 0) lines = [''];
          if (cursorY >= lines.length) cursorY = lines.length - 1;
          cursorX = Math.min(cursorX, lines[cursorY].length);
          dirty = true;
        }
        break;
      }
      case 'v': {
        if (clipboardText.length > 0) {
          // delete selection first if active
          const sel = getSelection();
          if (sel) deleteSelection(sel);

          // insert clipboard text at cursor
          const pasteLines = clipboardText.split('\n');
          if (pasteLines.length === 1) {
            // single line paste
            const line = lines[cursorY];
            lines[cursorY] = line.substring(0, cursorX) + pasteLines[0] + line.substring(cursorX);
            cursorX += pasteLines[0].length;
          } else {
            // multi-line paste
            const before = lines[cursorY].substring(0, cursorX);
            const after = lines[cursorY].substring(cursorX);
            lines[cursorY] = before + pasteLines[0];
            for (let i = 1; i < pasteLines.length - 1; i++) {
              lines.splice(cursorY + i, 0, pasteLines[i]);
            }
            const lastLine = pasteLines[pasteLines.length - 1];
            lines.splice(cursorY + pasteLines.length - 1, 0, lastLine + after);
            cursorY += pasteLines.length - 1;
            cursorX = lastLine.length;
          }
          dirty = true;
        }
        break;
      }
    }
    clampCursor();
    ensureCursorVisible();
    render();
    return;
  }

  // typing with active selection: delete selection first
  const selBeforeEdit = getSelection();

  // non-shift key clears selection (after we grab it for potential delete)
  switch (key.name) {
    // navigation
    case 'up':
      cursorY--;
      break;
    case 'down':
      cursorY++;
      break;
    case 'left':
      if (cursorX > 0) {
        cursorX--;
      } else if (cursorY > 0) {
        cursorY--;
        cursorX = lines[cursorY].length;
      }
      break;
    case 'right':
      if (cursorX < lines[cursorY].length) {
        cursorX++;
      } else if (cursorY < lines.length - 1) {
        cursorY++;
        cursorX = 0;
      }
      break;
    case 'home':
      cursorX = 0;
      break;
    case 'end':
      cursorX = lines[cursorY].length;
      break;
    case 'pageup':
      cursorY -= screen.height - 2;
      break;
    case 'pagedown':
      cursorY += screen.height - 2;
      break;

    // editing
    case 'enter': {
      if (selBeforeEdit) deleteSelection(selBeforeEdit);
      const before = lines[cursorY].substring(0, cursorX);
      const after = lines[cursorY].substring(cursorX);
      lines[cursorY] = before;
      lines.splice(cursorY + 1, 0, after);
      cursorY++;
      cursorX = 0;
      dirty = true;
      break;
    }
    case 'backspace': {
      if (selBeforeEdit) {
        deleteSelection(selBeforeEdit);
        break;
      }
      if (cursorX > 0) {
        const line = lines[cursorY];
        lines[cursorY] = line.substring(0, cursorX - 1) + line.substring(cursorX);
        cursorX--;
      } else if (cursorY > 0) {
        cursorX = lines[cursorY - 1].length;
        lines[cursorY - 1] += lines[cursorY];
        lines.splice(cursorY, 1);
        cursorY--;
      }
      dirty = true;
      break;
    }
    case 'delete': {
      if (selBeforeEdit) {
        deleteSelection(selBeforeEdit);
        break;
      }
      if (cursorX < lines[cursorY].length) {
        const line = lines[cursorY];
        lines[cursorY] = line.substring(0, cursorX) + line.substring(cursorX + 1);
      } else if (cursorY < lines.length - 1) {
        lines[cursorY] += lines[cursorY + 1];
        lines.splice(cursorY + 1, 1);
      }
      dirty = true;
      break;
    }
    case 'tab': {
      const line = lines[cursorY];
      lines[cursorY] = line.substring(0, cursorX) + '  ' + line.substring(cursorX);
      cursorX += 2;
      dirty = true;
      break;
    }

    // regular character input
    default: {
      if (key.name.length === 1 || key.name.length > 1 && !key.ctrl) {
        // filter out non-printable / unknown sequences
        const ch = key.name;
        if (ch === 'unknown') break;
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 32) {
          if (selBeforeEdit) deleteSelection(selBeforeEdit);
          const line = lines[cursorY];
          lines[cursorY] = line.substring(0, cursorX) + ch + line.substring(cursorX);
          cursorX += ch.length;
          dirty = true;
        }
      }
      break;
    }
  }

  selAnchor = null;
  clampCursor();
  ensureCursorVisible();
  render();
}

// init
screen.enter();
process.stdin.setRawMode(true);
process.stdin.on('data', handleKey);

// resize handling
process.stdout.on('resize', () => {
  ensureCursorVisible();
  render();
});

render();
