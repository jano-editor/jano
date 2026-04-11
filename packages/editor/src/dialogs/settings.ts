import {
  showDialog,
  drawList,
  listMoveUp,
  listMoveDown,
  drawToggle,
  type ListItem,
} from "@jano-editor/ui";
import type { Session } from "./session.ts";
import { getEditorSettings, updateEditorSetting, resetEditorSettings } from "../settings.ts";

type EditorSettingRow =
  | { kind: "cycler"; key: "tabSize"; label: string; values: number[] }
  | { kind: "toggle"; key: "insertSpaces" | "lineNumbers" | "autoComplete"; label: string }
  | { kind: "action"; action: "reset"; label: string };

const editorSettingRows: EditorSettingRow[] = [
  { kind: "cycler", key: "tabSize", label: "Tab Size", values: [2, 4, 8] },
  { kind: "toggle", key: "insertSpaces", label: "Insert Spaces" },
  { kind: "toggle", key: "lineNumbers", label: "Line Numbers" },
  { kind: "toggle", key: "autoComplete", label: "Auto Complete" },
  { kind: "action", action: "reset", label: "Reset to defaults" },
];

export function showSettings(s: Session): Promise<void> {
  s.dialogOpen = true;

  return new Promise((resolve) => {
    const dialogW = Math.min(60, s.screen.width - 4);
    const dialogH = Math.min(20, s.screen.height - 4);
    let backgroundDrawn = false;

    const categories: ListItem[] = [
      { label: "  Editor", value: "editor", description: "" },
      { label: "  Theme", value: "theme", description: "soon", disabled: true },
      { label: "  Plugins", value: "plugins", description: "soon", disabled: true },
      { label: "  Keybindings", value: "keybindings", description: "soon", disabled: true },
    ];

    let view: "categories" | "editor" = "categories";
    let catState = { selectedIndex: 0, scrollOffset: 0 };
    let editorIdx = 0;
    const listH = dialogH - 4;

    function renderSettings() {
      if (!backgroundDrawn) {
        s.update();
        backgroundDrawn = true;
      }

      const x = Math.floor((s.screen.width - dialogW) / 2);
      const y = Math.floor((s.screen.height - dialogH) / 2);

      s.draw.rect(x, y, dialogW, dialogH, {
        fg: [80, 90, 105] as [number, number, number],
        border: "round",
        fill: [30, 33, 40] as [number, number, number],
      });

      const titleText = view === "categories" ? " Settings " : " Settings › Editor ";
      const titleX = x + Math.floor((dialogW - titleText.length) / 2);
      s.draw.text(titleX, y, titleText, {
        fg: [230, 200, 100] as [number, number, number],
      });

      if (view === "categories") {
        drawList(s.draw, {
          x: x + 1,
          y: y + 2,
          width: dialogW - 2,
          height: listH,
          items: categories,
          selectedIndex: catState.selectedIndex,
          scrollOffset: catState.scrollOffset,
          bg: [30, 33, 40] as [number, number, number],
        });

        s.draw.text(x + 2, y + dialogH - 2, "↑↓ Navigate  Enter Select  Esc Close", {
          fg: [70, 75, 85] as [number, number, number],
          bg: [30, 33, 40] as [number, number, number],
        });
      } else {
        // editor sub-menu: render rows manually so we can use toggle widget
        const bg = [30, 33, 40] as [number, number, number];
        const selectedBg = [60, 100, 180] as [number, number, number];
        const fg = [171, 178, 191] as [number, number, number];
        const selectedFg = [255, 255, 255] as [number, number, number];
        const valueFg = [100, 105, 115] as [number, number, number];
        const actionFg = [200, 130, 130] as [number, number, number];

        const settings = getEditorSettings();

        for (let i = 0; i < editorSettingRows.length; i++) {
          const row = editorSettingRows[i];
          // separator before action row
          const rowY = y + 2 + i + (row.kind === "action" ? 1 : 0);
          const isSelected = i === editorIdx;
          const rowBg = isSelected ? selectedBg : bg;
          const labelFg = isSelected ? selectedFg : row.kind === "action" ? actionFg : fg;

          // fill row
          for (let col = 0; col < dialogW - 2; col++) {
            s.draw.char(x + 1 + col, rowY, " ", { bg: rowBg });
          }
          // label
          s.draw.text(x + 3, rowY, row.label, { fg: labelFg, bg: rowBg });

          if (row.kind === "toggle") {
            const widgetX = x + dialogW - 8;
            drawToggle(s.draw, {
              x: widgetX,
              y: rowY,
              value: settings[row.key],
              focused: false,
              bg: rowBg,
            });
          } else if (row.kind === "cycler") {
            const text = `‹ ${settings[row.key]} ›`;
            s.draw.text(x + dialogW - 2 - text.length, rowY, text, {
              fg: isSelected ? selectedFg : valueFg,
              bg: rowBg,
            });
          }
        }

        s.draw.text(x + 2, y + dialogH - 2, "↑↓ Navigate  ←→ Change  Enter Apply  Esc Back", {
          fg: [70, 75, 85] as [number, number, number],
          bg: [30, 33, 40] as [number, number, number],
        });
      }

      s.screen.hideCursor();
      s.draw.flush();
    }

    function changeSetting(direction: -1 | 1) {
      const row = editorSettingRows[editorIdx];
      const settings = getEditorSettings();
      if (row.kind === "toggle") {
        updateEditorSetting(row.key, !settings[row.key]);
      } else if (row.kind === "cycler") {
        const idx = row.values.indexOf(settings[row.key]);
        const next = (idx + direction + row.values.length) % row.values.length;
        updateEditorSetting(row.key, row.values[next]);
      }
    }

    async function activateRow() {
      const row = editorSettingRows[editorIdx];
      if (row.kind === "toggle") {
        const settings = getEditorSettings();
        updateEditorSetting(row.key, !settings[row.key]);
        renderSettings();
      } else if (row.kind === "action" && row.action === "reset") {
        // confirm dialog
        cleanup();
        const result = await showDialog(
          s.screen,
          s.draw,
          {
            title: "Reset settings?",
            message: "All editor settings will be restored to defaults.",
            buttons: [
              { label: "Reset", value: "reset" },
              { label: "Cancel", value: "cancel" },
            ],
            border: "round",
          },
          renderSettings,
        );
        if (result.type === "button" && result.value === "reset") {
          resetEditorSettings();
        }
        process.stdin.on("data", onData);
        renderSettings();
      }
    }

    function onData(data: Buffer) {
      if (data[0] === 0x1b && data.length === 1) {
        if (view === "editor") {
          view = "categories";
          renderSettings();
          return;
        }
        cleanup();
        s.dialogOpen = false;
        s.update();
        resolve();
        return;
      }

      if (data[0] === 0x1b && data[1] === 0x5b) {
        const seq = data.toString("utf8", 2);
        if (view === "categories") {
          if (seq === "A") {
            catState = listMoveUp(catState, categories);
            renderSettings();
          }
          if (seq === "B") {
            catState = listMoveDown(catState, categories, listH);
            renderSettings();
          }
        } else {
          if (seq === "A") {
            editorIdx = Math.max(0, editorIdx - 1);
            renderSettings();
          }
          if (seq === "B") {
            editorIdx = Math.min(editorSettingRows.length - 1, editorIdx + 1);
            renderSettings();
          }
          if (seq === "C") {
            changeSetting(1);
            renderSettings();
          }
          if (seq === "D") {
            changeSetting(-1);
            renderSettings();
          }
        }
        return;
      }

      // enter
      if (data[0] === 13) {
        if (view === "categories") {
          const sel = categories[catState.selectedIndex];
          if (sel.value === "editor" && !sel.disabled) {
            view = "editor";
            editorIdx = 0;
            renderSettings();
          }
        } else {
          void activateRow();
        }
        return;
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
    }

    process.stdin.on("data", onData);
    renderSettings();
  });
}
