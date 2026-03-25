import type { Screen, Draw, RGB } from '@jano/ui';
import type { EditorState } from './editor.ts';
import type { CursorState } from './cursor.ts';
import type { SelectionState } from './selection.ts';
import type { LanguagePlugin } from './plugins/types.ts';
import { getRange, isSelected } from './selection.ts';
import { tokenizeLine } from './highlight.ts';
import { tokenColors } from './plugins/types.ts';

function getShortcuts(plugin: LanguagePlugin | null): string[][] {
  const list = [
    ['^Q', 'Exit'],
    ['^O', 'Save'],
    ['^Z', 'Undo'],
    ['^Y', 'Redo'],
    ['^X', 'Cut'],
    ['^V', 'Paste'],
  ];
  if (plugin?.onFormat) {
    list.push(['F3', 'Format']);
  }
  return list;
}

export function gutterWidth(lineCount: number): number {
  return String(lineCount).length + 1;
}

export function getViewDimensions(screen: Screen, lineCount: number) {
  const gw = gutterWidth(lineCount);
  const contentTop = 1;
  const contentBottom = screen.height - 4;
  const viewH = contentBottom - contentTop + 1;
  const viewW = screen.width - 2 - gw;
  return { gw, contentTop, viewH, viewW };
}

export function render(
  screen: Screen,
  draw: Draw,
  editor: EditorState,
  cursor: CursorState,
  sel: SelectionState,
  plugin: LanguagePlugin | null,
) {
  draw.clear();

  const w = screen.width;
  const h = screen.height;
  const { gw, contentTop, viewH, viewW } = getViewDimensions(screen, editor.lines.length);
  const selRange = getRange(sel, cursor);

  // outer border
  draw.rect(0, 0, w, h - 1, { fg: [80, 80, 80], border: 'round' });

  // title bar
  const langName = plugin ? ` [${plugin.name}]` : '';
  const title = ` jano — ${editor.filePath}${langName} `;
  const titleX = Math.floor((w - title.length) / 2);
  draw.text(titleX, 0, title, { fg: [255, 255, 100] });

  // file content
  for (let y = 0; y < viewH; y++) {
    const lineIdx = y + cursor.scrollY;
    if (lineIdx >= editor.lines.length) break;

    // line number
    const lineNum = String(lineIdx + 1).padStart(gw - 1, ' ') + ' ';
    draw.text(1, contentTop + y, lineNum, { fg: [100, 100, 100] });

    // tokenize line for highlighting
    const line = editor.lines[lineIdx];
    const tokens = tokenizeLine(line, plugin);

    // build color map for this line
    const colorMap: (RGB | null)[] = new Array(line.length).fill(null);
    for (const token of tokens) {
      const color = tokenColors[token.type];
      if (color) {
        for (let i = token.start; i < token.end && i < line.length; i++) {
          colorMap[i] = color;
        }
      }
    }

    // draw characters
    for (let col = 0; col < viewW; col++) {
      const charIdx = col + cursor.scrollX;
      if (charIdx >= line.length) break;
      const ch = line[charIdx];

      if (isSelected(selRange, lineIdx, charIdx)) {
        draw.char(1 + gw + col, contentTop + y, ch, { fg: [255, 255, 255], bg: [60, 100, 180] });
      } else {
        const fg = colorMap[charIdx] ?? [171, 178, 191]; // default text color
        draw.char(1 + gw + col, contentTop + y, ch, { fg });
      }
    }
  }

  // status bar
  const statusY = h - 3;
  draw.line(1, statusY, w - 2, statusY, { fg: [80, 80, 80] });
  const modified = editor.dirty ? ' [modified]' : '';
  const status = ` Ln ${cursor.y + 1}, Col ${cursor.x + 1}  ${editor.lines.length} lines${modified}`;
  draw.text(2, statusY, status, { fg: [200, 200, 200] });

  // shortcut help
  const helpY = h - 1;
  let helpX = 0;
  const sc = getShortcuts(plugin);
  const pairWidth = Math.floor(w / sc.length);
  for (const [key, label] of sc) {
    draw.text(helpX, helpY, key, { fg: [0, 0, 0], bg: [200, 200, 200] });
    draw.text(helpX + key.length, helpY, ` ${label}`, { fg: [150, 150, 150] });
    helpX += pairWidth;
  }

  draw.flush();

  // position terminal cursor
  const screenCursorX = 1 + gw + (cursor.x - cursor.scrollX);
  const screenCursorY = contentTop + (cursor.y - cursor.scrollY);
  screen.moveTo(screenCursorX, screenCursorY);
  screen.showCursor();
}
