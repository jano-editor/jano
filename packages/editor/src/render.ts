import type { Screen, Draw, RGB } from "@jano-editor/ui";
import type { EditorState } from "./editor.ts";
import type { CursorManager } from "./cursor-manager.ts";
import type { LanguagePlugin, Diagnostic } from "./plugins/types.ts";
import type { GitInfo } from "./git.ts";
import { tokenizeLine } from "./highlight.ts";
import { tokenColors } from "./plugins/types.ts";
import { getEditorSettings } from "./settings.ts";
import { layoutLine, colAt, lineWidth } from "./text-layout.ts";

const DEFAULT_FG: RGB = [171, 178, 191];
const CONTROL_FG: RGB = [90, 95, 105];
const SELECTION_BG: RGB = [60, 100, 180];
const EXTRA_CURSOR_BG: RGB = [200, 200, 200];

function getShortcuts(plugin: LanguagePlugin | null): string[][] {
  const list = [
    ["F1", "Help"],
    ["^Q", "Exit"],
    ["^S", "Save"],
    ["^Z", "Undo"],
    ["^X", "Cut"],
    ["^V", "Paste"],
    ["^F", "Search"],
    ["^G", "Go to"],
    ["^D", "Next"],
    ["F2", "History"],
  ];
  const isWindows = process.platform === "win32" || !!process.env["WSL_DISTRO_NAME"];
  list.push([isWindows ? "^⌥↕" : "^⇧↕", "Multi"]);
  if (plugin?.onFormat) {
    list.push(["F3", "Format"]);
  }
  if (plugin?.onValidate) {
    list.push(["F4", "Issues"]);
  }
  return list;
}

// width reserved on the right side for the F9 ⚙ entry (always shown)
// matches the actual entry width used in render: "F9" + " " + 2 cells for emoji + 1 padding
const SETTINGS_ENTRY_W = 6;

// the X coordinate where the F9 ⚙ entry starts (last cell - settingsEntryW)
function getSettingsX(screenW: number): number {
  return screenW - SETTINGS_ENTRY_W - 1;
}

// the rightmost column available for left-aligned shortcuts on the last help row
function getLeftLimit(screenW: number): number {
  return getSettingsX(screenW) - 1;
}

// returns the number of help rows (1 or 2) needed to fit all shortcuts
function calculateHelpRows(screenW: number, plugin: LanguagePlugin | null): 1 | 2 {
  const sc = getShortcuts(plugin);
  const limit = getLeftLimit(screenW);
  let helpX = 1;
  for (const [key, label] of sc) {
    const entryWidth = key.length + label.length + 3;
    if (helpX + entryWidth > limit) return 2;
    helpX += entryWidth;
  }
  return 1;
}

export function gutterWidth(lineCount: number): number {
  if (!getEditorSettings().lineNumbers) return 0;
  return String(lineCount).length + 1;
}

export function getViewDimensions(
  screen: Screen,
  lineCount: number,
  plugin: LanguagePlugin | null = null,
) {
  const gw = gutterWidth(lineCount);
  const helpRows = calculateHelpRows(screen.width, plugin);
  const contentTop = 1;
  // bottom area: status bar + bottom border + N help rows
  const contentBottom = screen.height - 3 - helpRows;
  const viewH = contentBottom - contentTop + 1;
  const viewW = screen.width - 2 - gw;
  return { gw, contentTop, viewH, viewW, helpRows };
}

export function render(
  screen: Screen,
  draw: Draw,
  editor: EditorState,
  cm: CursorManager,
  plugin: LanguagePlugin | null,
  pluginVersion?: string,
  diagnostics?: Diagnostic[],
  gitInfo?: GitInfo | null,
) {
  draw.clear();

  const w = screen.width;
  const h = screen.height;
  const { gw, contentTop, viewH, viewW, helpRows } = getViewDimensions(
    screen,
    editor.lines.length,
    plugin,
  );

  // bottom row positions
  // layout (bottom-up): help row(s), bottom border, status bar, content
  const lastHelpY = h - 1;
  const firstHelpY = h - helpRows;
  const bottomBorderY = firstHelpY - 1; // bottom edge of the rect
  const statusY = bottomBorderY - 1;
  const rectHeight = bottomBorderY + 1; // rect spans rows 0..bottomBorderY

  // outer border
  draw.rect(0, 0, w, rectHeight, { fg: [55, 60, 70], border: "round" });

  // title bar background
  for (let x = 1; x < w - 1; x++) {
    draw.char(x, 0, "─", { fg: [55, 60, 70] });
  }
  // title
  const langName = plugin ? ` [${plugin.name}]` : "";
  const title = ` jano — ${editor.filePath || "untitled"}${langName} `;
  const titleX = Math.floor((w - title.length) / 2);
  draw.text(titleX, 0, title, { fg: [230, 200, 100] });

  // DEBUG badge (left side of title bar) when running in debug mode
  if (process.env.JANO_DEBUG === "1") {
    const badge = " DEBUG ";
    draw.text(2, 0, badge, { fg: [255, 255, 255], bg: [200, 40, 40] });
  }

  // editor version (right side of title bar)
  const editorVersion = process.env.JANO_VERSION;
  if (editorVersion) {
    const vText = ` v${editorVersion} `;
    draw.text(w - vText.length - 1, 0, vText, { fg: [80, 85, 95] });
  }

  const tabSize = getEditorSettings().tabSize;

  // file content
  for (let y = 0; y < viewH; y++) {
    const lineIdx = y + cm.scrollY;
    if (lineIdx >= editor.lines.length) break;

    // line number (highlight current line, red for errors)
    const isCurrentLine = lineIdx === cm.primary.y;
    const lineDiags = diagnostics?.filter((d) => d.line === lineIdx) || [];
    const hasError = lineDiags.some((d) => d.severity === "error");
    const hasWarning = lineDiags.some((d) => d.severity === "warning");
    if (gw > 0) {
      const lineNum = String(lineIdx + 1).padStart(gw - 1, " ") + " ";
      const lineNumFg: RGB = hasError
        ? [255, 80, 80]
        : hasWarning
          ? [229, 192, 123]
          : isCurrentLine
            ? [180, 185, 195]
            : [70, 75, 85];
      draw.text(1, contentTop + y, lineNum, { fg: lineNumFg });
    }

    // tokenize line for highlighting
    const line = editor.lines[lineIdx];
    const tokens = tokenizeLine(line, plugin, lineIdx, editor.lines);

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

    const screenY = contentTop + y;
    const errorBg: RGB | undefined = hasError
      ? [60, 20, 20]
      : hasWarning
        ? [50, 40, 15]
        : undefined;

    // style of the cell at string index idx (idx >= line.length means past the line end)
    const styleAt = (idx: number, fg: RGB) => {
      if (cm.isCellSelected(lineIdx, idx)) return { fg: [255, 255, 255] as RGB, bg: SELECTION_BG };
      if (cm.isCellExtraCursor(lineIdx, idx)) return { fg: [0, 0, 0] as RGB, bg: EXTRA_CURSOR_BG };
      return { fg, bg: errorBg };
    };

    // draw glyphs (tabs expanded, wide chars take two cells)
    for (const g of layoutLine(line, tabSize)) {
      const start = g.col - cm.scrollX;
      if (g.width === 0 || start + g.width <= 0) continue;
      if (start >= viewW) break;

      const style = styleAt(g.idx, g.control ? CONTROL_FG : (colorMap[g.idx] ?? DEFAULT_FG));
      if (g.width === 2 && start >= 0 && start + 1 < viewW) {
        draw.text(1 + gw + start, screenY, g.text, style);
        continue;
      }
      // narrow glyphs, tab padding, or a wide glyph cut off at the viewport edge
      for (let c = 0; c < g.width; c++) {
        const vx = start + c;
        if (vx < 0 || vx >= viewW) continue;
        draw.char(1 + gw + vx, screenY, g.width === 1 ? g.text : " ", style);
      }
    }

    // past the line end: selection of the line break, extra cursors, error tint
    const endCol = lineWidth(line, tabSize);
    for (let vx = Math.max(0, endCol - cm.scrollX); vx < viewW; vx++) {
      const idx = line.length + (vx + cm.scrollX - endCol);
      const style = styleAt(idx, DEFAULT_FG);
      if (style.bg) draw.char(1 + gw + vx, screenY, " ", { bg: style.bg });
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
    ...editor.lines.slice(cm.scrollY, cm.scrollY + viewH).map((l) => lineWidth(l, tabSize)),
    0,
  );
  if (maxLineLen > viewW) {
    const scrollRatio = cm.scrollX / (maxLineLen - viewW);
    const thumbSize = Math.max(2, Math.round(viewW * (viewW / maxLineLen)));
    const thumbPos = Math.round(scrollRatio * (viewW - thumbSize));
    for (let x = 0; x < viewW; x++) {
      if (x >= thumbPos && x < thumbPos + thumbSize) {
        draw.char(1 + gw + x, bottomBorderY, "━", { fg: [140, 140, 140] });
      }
    }
  }

  // status bar
  const p = cm.primary;
  // fill status bar background
  for (let x = 1; x < w - 1; x++) {
    draw.char(x, statusY, " ", { bg: [45, 50, 60] });
  }
  // left: cursor position
  const posInfo = ` Ln ${p.y + 1}, Col ${colAt(editor.lines[p.y] ?? "", p.x, tabSize) + 1}`;
  draw.text(2, statusY, posInfo, { fg: [180, 185, 195], bg: [45, 50, 60] });
  // plugin info
  if (plugin) {
    const pluginInfo = ` ${plugin.name}${pluginVersion ? ` v${pluginVersion}` : ""} `;
    draw.text(2 + posInfo.length + 1, statusY, pluginInfo, {
      fg: [100, 105, 115],
      bg: [45, 50, 60],
    });
  }
  // center: file info
  const modified = editor.dirty ? " ●" : "";
  // only shown when they differ from the default (LF, no BOM)
  const format = `${editor.eol === "\r\n" ? " · CRLF" : ""}${editor.bom ? " · BOM" : ""}`;
  const fileInfo = `${editor.lines.length} lines${format}${modified}`;
  const fileInfoX = Math.floor((w - fileInfo.length) / 2);
  draw.text(fileInfoX, statusY, fileInfo, {
    fg: editor.dirty ? [229, 192, 123] : [130, 135, 145],
    bg: [45, 50, 60],
  });
  // right: git, diagnostics & multi-cursor
  const rightItems: { text: string; fg: RGB }[] = [];
  if (gitInfo) {
    const maxBranchLen = 25;
    const branch =
      gitInfo.branch.length > maxBranchLen
        ? gitInfo.branch.substring(0, maxBranchLen - 1) + "…"
        : gitInfo.branch;
    let gitLabel = gitInfo.worktree ? `⊙ ${gitInfo.worktree} ` : "";
    gitLabel += `⎇ ${branch}`;
    rightItems.push({ text: gitLabel, fg: [100, 180, 220] });
  }
  if (diagnostics && diagnostics.length > 0) {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.filter((d) => d.severity === "warning").length;
    const parts: string[] = [];
    if (errors > 0) parts.push(`✗ ${errors}`);
    if (warnings > 0) parts.push(`⚠ ${warnings}`);
    rightItems.push({
      text: parts.join("  "),
      fg: errors > 0 ? ([255, 80, 80] as RGB) : ([229, 192, 123] as RGB),
    });
  }
  if (cm.isMulti) {
    rightItems.push({ text: `${cm.count} cursors`, fg: [100, 200, 255] });
  }
  const sep = " │ ";
  const totalRightW =
    rightItems.reduce((sum, item) => sum + item.text.length, 0) +
    Math.max(0, rightItems.length - 1) * sep.length;
  let rightX = w - 1 - totalRightW;
  for (let i = 0; i < rightItems.length; i++) {
    if (i > 0) {
      draw.text(rightX, statusY, sep, { fg: [70, 75, 85], bg: [45, 50, 60] });
      rightX += sep.length;
    }
    draw.text(rightX, statusY, rightItems[i].text, { fg: rightItems[i].fg, bg: [45, 50, 60] });
    rightX += rightItems[i].text.length;
  }

  // shortcut help — fill 1 or 2 rows
  const sc = getShortcuts(plugin);
  // clear all help rows
  for (let row = firstHelpY; row <= lastHelpY; row++) {
    for (let x = 0; x < w; x++) {
      draw.char(x, row, " ", { bg: [35, 38, 45] });
    }
  }

  // right-aligned: F9 settings (always visible, on the last help row)
  const settingsKey = "F9";
  const settingsLabel = "⚙";
  const settingsX = getSettingsX(w);
  draw.text(settingsX, lastHelpY, settingsKey, { fg: [220, 220, 220], bg: [60, 65, 75] });
  draw.text(settingsX + settingsKey.length, lastHelpY, ` ${settingsLabel}`, {
    fg: [120, 125, 135],
    bg: [35, 38, 45],
  });

  // left-aligned shortcuts, wrap to second row if needed
  // first row uses the full width minus the settings entry only on the last row
  let curRow = firstHelpY;
  let helpX = 1;
  for (let i = 0; i < sc.length; i++) {
    const [key, label] = sc[i];
    const entryWidth = key.length + label.length + 3;
    // limit depends on whether this row is the last one (where settings sits)
    const isLastRow = curRow === lastHelpY;
    const limit = isLastRow ? settingsX - 1 : w - 1;

    // wrap to next row if no more space
    if (helpX + entryWidth > limit) {
      if (curRow < lastHelpY) {
        curRow++;
        helpX = 1;
        // recompute limit for the new row
        const newLimit = curRow === lastHelpY ? settingsX - 1 : w - 1;
        if (helpX + entryWidth > newLimit) break; // still doesn't fit, stop
      } else {
        break; // last row full, stop
      }
    }

    draw.text(helpX, curRow, key, { fg: [220, 220, 220], bg: [60, 65, 75] });
    draw.text(helpX + key.length, curRow, ` ${label}`, {
      fg: [120, 125, 135],
      bg: [35, 38, 45],
    });
    helpX += entryWidth;

    // separator before next entry (only if it stays on this row)
    if (i < sc.length - 1) {
      const isLast = curRow === lastHelpY;
      const lim = isLast ? settingsX - 1 : w - 1;
      if (helpX < lim) {
        draw.text(helpX - 1, curRow, "│", { fg: [55, 58, 65], bg: [35, 38, 45] });
      }
    }
  }

  screen.hideCursor();
  draw.flush();
}

/**
 * Position the terminal cursor on the primary editor cursor.
 * Call this as the very last step in a render cycle, AFTER all overlays
 * (completion popup, alert, dialogs, etc.) have been flushed — otherwise
 * their flushes leave the terminal cursor at the last written cell, which
 * hides or misplaces the blinking cursor.
 */
export function positionCursor(
  screen: Screen,
  editor: EditorState,
  cm: CursorManager,
  plugin: LanguagePlugin | null,
) {
  const { gw, contentTop, viewH, viewW } = getViewDimensions(screen, editor.lines.length, plugin);
  const p = cm.primary;
  const col = colAt(editor.lines[p.y] ?? "", p.x, getEditorSettings().tabSize);
  const screenCursorX = 1 + gw + (col - cm.scrollX);
  const screenCursorY = contentTop + (p.y - cm.scrollY);
  if (
    screenCursorY >= contentTop &&
    screenCursorY < contentTop + viewH &&
    screenCursorX >= 1 + gw &&
    screenCursorX < 1 + gw + viewW
  ) {
    screen.moveTo(screenCursorX, screenCursorY);
    screen.showCursor();
  } else {
    screen.hideCursor();
  }
}
