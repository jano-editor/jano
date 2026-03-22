#!/usr/bin/env node
import { createScreen, createDraw, showDialog } from '@jano/ui';
import { createEditor, save } from './editor.js';
import { createCursor, ensureVisible } from './cursor.js';
import { createSelection } from './selection.js';
import { createUndoManager } from './undo.js';
import { parseKey } from './keypress.js';
import { handleKey } from './input.js';
import { render, getViewDimensions } from './render.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: jano <file>');
  process.exit(1);
}

const screen = createScreen();
const draw = createDraw(screen);
const editor = createEditor(filePath);
const cursor = createCursor();
const selection = createSelection();
const undo = createUndoManager();

let dialogOpen = false;

function update() {
  const { viewW, viewH } = getViewDimensions(screen, editor.lines.length);
  ensureVisible(cursor, viewW, viewH);
  render(screen, draw, editor, cursor, selection);
}

async function confirmExit() {
  if (!editor.dirty) {
    screen.leave();
    process.exit(0);
  }

  dialogOpen = true;

  const result = await showDialog(screen, draw, {
    title: 'Unsaved Changes',
    message: `Save changes to "${editor.filePath}" before closing?`,
    buttons: [
      { label: 'Save', value: 'save' },
      { label: 'Discard', value: 'discard' },
      { label: 'Cancel', value: 'cancel' },
    ],
    border: 'round',
  }, update);

  dialogOpen = false;

  if (result.type === 'button') {
    if (result.value === 'save') {
      save(editor);
      screen.leave();
      process.exit(0);
    }
    if (result.value === 'discard') {
      screen.leave();
      process.exit(0);
    }
  }

  update();
}

async function showHistory() {
  const history = undo.getHistory();

  if (history.length === 0) {
    dialogOpen = true;
    await showDialog(screen, draw, {
      title: 'History',
      message: 'No changes recorded yet.',
      buttons: [{ label: 'OK', value: 'ok' }],
      border: 'round',
    }, update);
    dialogOpen = false;
    update();
    return;
  }

  dialogOpen = true;

  // build history list with readable descriptions
  const items: string[] = ['  0. Original file'];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const desc = undo.describeEntry(entry);
    const marker = i === history.length - 1 ? '▸' : ' ';
    items.push(`${marker} ${i + 1}. [${time}] ${desc}`);
  }

  const result = await showDialog(screen, draw, {
    title: `History (${history.length} changes)`,
    message: items.slice(-15).join('\n'),
    input: true,
    inputPlaceholder: 'Number (0 = original)...',
    buttons: [
      { label: 'Jump', value: 'jump' },
      { label: 'Cancel', value: 'cancel' },
    ],
    border: 'round',
    width: 60,
  }, update);

  dialogOpen = false;

  if (result.type === 'input' || (result.type === 'button' && result.value === 'jump')) {
    const inputVal = result.type === 'input' ? result.value : (result.inputValue ?? '');
    const idx = parseInt(inputVal, 10);

    if (idx === 0) {
      // jump to original: undo everything
      while (true) {
        const undone = undo.undo(editor.lines, cursor);
        if (!undone) break;
        editor.lines = undone;
      }
      editor.dirty = false;
    } else if (idx >= 1 && idx <= history.length) {
      editor.lines = undo.jumpTo(idx - 1, editor.lines, cursor);
      editor.dirty = true;
    }
  }

  update();
}

screen.enter();
process.stdin.setRawMode(true);

process.stdin.on('data', (data) => {
  if (dialogOpen) return;

  const key = parseKey(data);
  const result = handleKey(key, editor, cursor, selection, screen, undo);

  switch (result) {
    case 'exit':
      confirmExit();
      return;
    case 'history':
      showHistory();
      return;
  }

  update();
});

process.stdout.on('resize', update);

update();
