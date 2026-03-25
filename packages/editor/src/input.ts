import type { Screen } from '@jano/ui';
import type { EditorState } from './editor.ts';
import type { CursorState } from './cursor.ts';
import type { SelectionState } from './selection.ts';
import type { KeyEvent } from './keypress.ts';
import type { UndoManager } from './undo.ts';
import type { LanguagePlugin } from './plugins/types.ts';
import { clamp, moveLeft, moveRight } from './cursor.ts';
import * as sel from './selection.ts';
import * as ed from './editor.ts';
import { buildContext } from './plugins/context.ts';
import { applyEditResult } from './plugins/apply.ts';

export type HandleKeyResult = 'continue' | 'exit' | 'history';

function getViewport(cursor: CursorState, screen: Screen) {
  return {
    firstLine: cursor.scrollY,
    lastLine: cursor.scrollY + screen.height - 5,
    width: screen.width,
    height: screen.height,
  };
}

export function handleKey(
  key: KeyEvent,
  editor: EditorState,
  cursor: CursorState,
  selection: SelectionState,
  screen: Screen,
  undo: UndoManager,
  plugin: LanguagePlugin | null,
): HandleKeyResult {
  // shift+arrow: start or extend selection
  if (key.shift && ['up', 'down', 'left', 'right', 'home', 'end'].includes(key.name)) {
    sel.startOrExtend(selection, cursor);

    switch (key.name) {
      case 'up': cursor.y--; break;
      case 'down': cursor.y++; break;
      case 'left': cursor.x--; break;
      case 'right': cursor.x++; break;
      case 'home': cursor.x = 0; break;
      case 'end': cursor.x = editor.lines[cursor.y].length; break;
    }

    clamp(cursor, editor.lines);
    sel.collapseIfEmpty(selection, cursor);
    return 'continue';
  }

  // F2 = history dialog
  if (key.name === 'f2') return 'history';

  // F3 = format document
  if (key.name === 'f3' && plugin?.onFormat) {
    undo.snapshot('format', { x: cursor.x, y: cursor.y }, editor.lines);
    const ctx = buildContext(editor, cursor, selection, 'format', getViewport(cursor, screen));
    const result = plugin.onFormat(ctx);
    if (result) applyEditResult(result, editor, cursor, selection);
    undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
    clamp(cursor, editor.lines);
    return 'continue';
  }

  // ctrl shortcuts
  if (key.ctrl) {
    switch (key.name) {
      case 'q':
        return 'exit';

      case 'o':
        ed.save(editor);
        break;

      case 'z': {
        const result = undo.undo(editor.lines, cursor);
        if (result) {
          editor.lines = result;
          editor.dirty = true;
        }
        break;
      }

      case 'y': {
        const result = undo.redo(editor.lines, cursor);
        if (result) {
          editor.lines = result;
          editor.dirty = true;
        }
        break;
      }


      case 'c': {
        const range = sel.getRange(selection, cursor);
        if (range) {
          editor.clipboardText = sel.getText(range, editor.lines);
          sel.clear(selection);
        }
        break;
      }

      case 'x': {
        undo.snapshot('cut', { x: cursor.x, y: cursor.y }, editor.lines);
        const range = sel.getRange(selection, cursor);
        if (range) {
          editor.clipboardText = sel.getText(range, editor.lines);
          sel.deleteRange(range, editor, cursor, selection);
        } else {
          const result = ed.cutLine(editor, cursor.y);
          editor.clipboardText = result.clipText;
          cursor.y = result.newY;
          cursor.x = Math.min(cursor.x, editor.lines[cursor.y].length);
        }
        undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
        break;
      }

      case 'v': {
        if (editor.clipboardText.length > 0) {
          undo.snapshot('paste', { x: cursor.x, y: cursor.y }, editor.lines);
          const range = sel.getRange(selection, cursor);
          if (range) sel.deleteRange(range, editor, cursor, selection);
          const pos = ed.pasteText(editor, cursor.x, cursor.y, editor.clipboardText);
          cursor.x = pos.x;
          cursor.y = pos.y;
          undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
        }
        break;
      }
    }

    clamp(cursor, editor.lines);
    return 'continue';
  }

  // grab selection before clearing it
  const selRange = sel.getRange(selection, cursor);

  switch (key.name) {
    // navigation
    case 'up': cursor.y--; break;
    case 'down': cursor.y++; break;
    case 'left': moveLeft(cursor, editor.lines); break;
    case 'right': moveRight(cursor, editor.lines); break;
    case 'home': cursor.x = 0; break;
    case 'end': cursor.x = editor.lines[cursor.y].length; break;
    case 'pageup': cursor.y -= screen.height - 2; break;
    case 'pagedown': cursor.y += screen.height - 2; break;

    // editing
    case 'enter': {
      undo.snapshot('enter', { x: cursor.x, y: cursor.y }, editor.lines);
      if (selRange) sel.deleteRange(selRange, editor, cursor, selection);

      const pos = ed.insertNewline(editor, cursor.x, cursor.y);
      cursor.x = pos.x;
      cursor.y = pos.y;

      // ask plugin
      if (plugin?.onNewLine) {
        const ctx = buildContext(editor, cursor, selection, 'newline', getViewport(cursor, screen));
        const result = plugin.onNewLine(ctx);
        if (result) applyEditResult(result, editor, cursor, selection);
      }

      undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
      break;
    }
    case 'backspace': {
      undo.snapshot('backspace', { x: cursor.x, y: cursor.y }, editor.lines);
      if (selRange) {
        sel.deleteRange(selRange, editor, cursor, selection);
      } else {
        const pos = ed.deleteCharBack(editor, cursor.x, cursor.y);
        cursor.x = pos.x;
        cursor.y = pos.y;
      }
      undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
      break;
    }
    case 'delete': {
      undo.snapshot('delete', { x: cursor.x, y: cursor.y }, editor.lines);
      if (selRange) {
        sel.deleteRange(selRange, editor, cursor, selection);
      } else {
        ed.deleteCharForward(editor, cursor.x, cursor.y);
      }
      undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
      break;
    }
    case 'tab': {
      undo.snapshot('tab', { x: cursor.x, y: cursor.y }, editor.lines);
      cursor.x = ed.insertTab(editor, cursor.x, cursor.y);
      undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
      break;
    }

    // regular character
    default: {
      const ch = key.name;
      if (ch === 'unknown') break;
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 32) {
        undo.snapshot('type', { x: cursor.x, y: cursor.y }, editor.lines);
        if (selRange) sel.deleteRange(selRange, editor, cursor, selection);
        cursor.x = ed.insertChar(editor, cursor.x, cursor.y, ch);

        // ask plugin
        if (plugin?.onCharTyped) {
          const ctx = buildContext(editor, cursor, selection, 'char', getViewport(cursor, screen), { char: ch });
          const result = plugin.onCharTyped(ctx);
          if (result) applyEditResult(result, editor, cursor, selection);
        }

        undo.commit({ x: cursor.x, y: cursor.y }, editor.lines);
      }
      break;
    }
  }

  sel.clear(selection);
  clamp(cursor, editor.lines);
  return 'continue';
}
