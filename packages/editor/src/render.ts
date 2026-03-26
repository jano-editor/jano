import type { Screen, Draw, RGB } from "@jano/ui";
import type { EditorState } from "./editor.ts";
import type { CursorManager } from "./cursor-manager.ts";
import type { LanguagePlugin } from "./plugins/types.ts";
import { tokenizeLine } from "./highlight.ts";
import { tokenColors } from "./plugins/types.ts";

function getShortcuts(plugin: LanguagePlugin | null): string[][] {
  const list = [
    ["^Q", "Exit"],
    ["^S", "Save"],
    ["^Z", "Undo"],
    ["^Y", "Redo"],
    ["^X", "Cut"],
    ["^V", "Paste"],
  ];
  list.push(["^F", "Search"]);
  list.push(["^G", "Go to"]);
  list.push(["^⇧↕", "Multi"]);
  if (plugin?.onFormat) {
    list.push(["F3", "Format"]);
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
  cm: CursorManager,
  plugin: LanguagePlugin | null,
  pluginVersion?: string,
) {
  draw.clear();

  const w = screen.width;
  const h = screen.height;
  const { gw, contentTop, viewH, viewW } = getViewDimensions(screen, editor.lines.length);

  // outer border
  draw.rect(0, 0, w, h - 1, { fg: [55, 60, 70], border: "round" });

  // title bar background
  for (let x = 1; x < w - 1; x++) {
    draw.char(x, 0, "─", { fg: [55, 60, 70] });
  }
  // title
  const langName = plugin ? ` [${plugin.name}]` : "";
  const title = ` jano — ${editor.filePath}${langName} `;
  const titleX = Math.floor((w - title.length) / 2);
  draw.text(titleX, 0, title, { fg: [230, 200, 100] });

  // plugin version (right side)
  if (plugin && pluginVersion) {
    const vText = ` v${pluginVersion} `;
    draw.text(w - vText.length - 1, 0, vText, { fg: [80, 85, 95] });
  }

  // file content
  for (let y = 0; y < viewH; y++) {
    const lineIdx = y + cm.scrollY;
    if (lineIdx >= editor.lines.length) break;

    // line number (highlight current line)
    const lineNum = String(lineIdx + 1).padStart(gw - 1, " ") + " ";
    const isCurrentLine = lineIdx === cm.primary.y;
    draw.text(1, contentTop + y, lineNum, { fg: isCurrentLine ? [180, 185, 195] : [70, 75, 85] });

    // tokenize line for highlighting
    const line = editor.lines[lineIdx];
    const tokens = tokenizeLine(line, plugin);

    // build color map for this line
    const colorMap: (RGB | null)[] = Array.from<RGB | null>({ length: line.length }).fill(null);
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
      const charIdx = col + cm.scrollX;
      const screenX = 1 + gw + col;
      const screenY = contentTop + y;
      const ch = charIdx < line.length ? line[charIdx] : " ";

      if (cm.isCellSelected(lineIdx, charIdx)) {
        draw.char(screenX, screenY, ch, { fg: [255, 255, 255], bg: [60, 100, 180] });
      } else if (cm.isCellExtraCursor(lineIdx, charIdx)) {
        draw.char(screenX, screenY, ch, { fg: [0, 0, 0], bg: [200, 200, 200] });
      } else if (charIdx < line.length) {
        const fg = colorMap[charIdx] ?? [171, 178, 191];
        draw.char(screenX, screenY, ch, { fg });
      }
    }
  }

  // vertical scrollbar (on the right border)
  if (editor.lines.length > viewH) {
    const scrollRatio = cm.scrollY / (editor.lines.length - viewH);
    const thumbSize = Math.max(1, Math.round(viewH * (viewH / editor.lines.length)));
    const thumbPos = Math.round(scrollRatio * (viewH - thumbSize));
    for (let y = 0; y < viewH; y++) {
      const screenY = contentTop + y;
      if (y >= thumbPos && y < thumbPos + thumbSize) {
        draw.char(w - 1, screenY, "┃", { fg: [140, 140, 140] });
      }
    }
  }

  // horizontal scrollbar (on the bottom border)
  const maxLineLen = Math.max(
    ...editor.lines.slice(cm.scrollY, cm.scrollY + viewH).map((l) => l.length),
    0,
  );
  if (maxLineLen > viewW) {
    const scrollRatio = cm.scrollX / (maxLineLen - viewW);
    const thumbSize = Math.max(2, Math.round(viewW * (viewW / maxLineLen)));
    const thumbPos = Math.round(scrollRatio * (viewW - thumbSize));
    const barY = h - 2; // bottom border line
    for (let x = 0; x < viewW; x++) {
      if (x >= thumbPos && x < thumbPos + thumbSize) {
        draw.char(1 + gw + x, barY, "━", { fg: [140, 140, 140] });
      }
    }
  }

  // status bar
  const p = cm.primary;
  const statusY = h - 3;
  // fill status bar background
  for (let x = 1; x < w - 1; x++) {
    draw.char(x, statusY, " ", { bg: [45, 50, 60] });
  }
  // left: cursor position
  const posInfo = ` Ln ${p.y + 1}, Col ${p.x + 1}`;
  draw.text(2, statusY, posInfo, { fg: [180, 185, 195], bg: [45, 50, 60] });
  // center: file info
  const modified = editor.dirty ? " ●" : "";
  const fileInfo = `${editor.lines.length} lines${modified}`;
  const fileInfoX = Math.floor((w - fileInfo.length) / 2);
  draw.text(fileInfoX, statusY, fileInfo, {
    fg: editor.dirty ? [229, 192, 123] : [130, 135, 145],
    bg: [45, 50, 60],
  });
  // right: multi-cursor info
  if (cm.isMulti) {
    const multiInfo = `${cm.count} cursors `;
    draw.text(w - multiInfo.length - 1, statusY, multiInfo, {
      fg: [100, 200, 255],
      bg: [45, 50, 60],
    });
  }

  // shortcut help
  const helpY = h - 1;
  const sc = getShortcuts(plugin);
  // fill background
  for (let x = 0; x < w; x++) {
    draw.char(x, helpY, " ", { bg: [35, 38, 45] });
  }
  // draw shortcuts evenly spaced with separator
  let helpX = 1;
  for (let i = 0; i < sc.length; i++) {
    const [key, label] = sc[i];
    draw.text(helpX, helpY, key, { fg: [220, 220, 220], bg: [60, 65, 75] });
    draw.text(helpX + key.length, helpY, ` ${label}`, { fg: [120, 125, 135], bg: [35, 38, 45] });
    helpX += key.length + label.length + 3;
    if (i < sc.length - 1) {
      draw.text(helpX - 1, helpY, "│", { fg: [55, 58, 65], bg: [35, 38, 45] });
    }
  }

  screen.hideCursor();
  draw.flush();

  // position terminal cursor on primary
  const screenCursorX = 1 + gw + (p.x - cm.scrollX);
  const screenCursorY = contentTop + (p.y - cm.scrollY);
  screen.moveTo(screenCursorX, screenCursorY);
  screen.showCursor();
}
