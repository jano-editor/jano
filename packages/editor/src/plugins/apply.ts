import type { EditResult } from './types.ts';
import type { EditorState } from '../editor.ts';
import type { CursorManager, SingleCursor } from '../cursor-manager.ts';

// apply edit result, optionally targeting a specific cursor instead of primary
export function applyEditResult(
  result: EditResult,
  editor: EditorState,
  cm: CursorManager,
  targetCursor?: SingleCursor,
) {
  if (result.replaceAll) {
    editor.lines = result.replaceAll;
    editor.dirty = true;
  }

  if (result.edits) {
    const sorted = [...result.edits].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.col - a.range.start.col;
    });

    for (const edit of sorted) {
      const { start, end } = edit.range;

      if (start.line === end.line) {
        const line = editor.lines[start.line];
        editor.lines[start.line] =
          line.substring(0, start.col) + edit.text + line.substring(end.col);
      } else {
        const firstPart = editor.lines[start.line].substring(0, start.col);
        const lastPart = editor.lines[end.line].substring(end.col);
        const newLines = edit.text.split('\n');
        newLines[0] = firstPart + newLines[0];
        newLines[newLines.length - 1] = newLines[newLines.length - 1] + lastPart;
        editor.lines.splice(start.line, end.line - start.line + 1, ...newLines);
      }

      editor.dirty = true;
    }
  }

  if (result.cursors && result.cursors.length > 0) {
    const resultCursor = result.cursors[0];
    const target = targetCursor ?? cm.primary;
    target.x = resultCursor.position.col;
    target.y = resultCursor.position.line;
    target.anchor = resultCursor.anchor
      ? { x: resultCursor.anchor.col, y: resultCursor.anchor.line }
      : null;
  }
}
