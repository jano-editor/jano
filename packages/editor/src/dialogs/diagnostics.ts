import { showDialog, drawList, listMoveUp, listMoveDown } from "@jano-editor/ui";
import type { Session } from "./session.ts";

export function showDiagnostics(s: Session): Promise<void> {
  const diags = s.validator.state.diagnostics;

  if (diags.length === 0) {
    s.dialogOpen = true;
    return showDialog(
      s.screen,
      s.draw,
      {
        title: "Diagnostics",
        message: "No issues found.",
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      s.update,
    ).then(() => {
      s.dialogOpen = false;
      s.update();
    });
  }

  s.dialogOpen = true;

  return new Promise((resolve) => {
    const dialogW = Math.min(65, s.screen.width - 4);
    const listH = Math.min(18, s.screen.height - 6);
    let listState = { selectedIndex: 0, scrollOffset: 0 };
    let backgroundDrawn = false;

    const errors = diags.filter((d) => d.severity === "error").length;
    const warnings = diags.filter((d) => d.severity === "warning").length;
    const maxMsg = dialogW - 18;

    const listItems = diags.map((d) => {
      const icon = d.severity === "error" ? "✗" : d.severity === "warning" ? "⚠" : "ℹ";
      const msg = d.message.length > maxMsg ? d.message.substring(0, maxMsg - 1) + "…" : d.message;
      return {
        label: ` ${icon} Ln ${String(d.line + 1).padStart(4)} │ ${msg}`,
        value: `${d.line}`,
      };
    });

    function renderDiag() {
      if (!backgroundDrawn) {
        s.update();
        backgroundDrawn = true;
      }

      const totalH = 3 + listH + 1;
      const x = Math.floor((s.screen.width - dialogW) / 2);
      const y = 1;

      s.draw.rect(x, y, dialogW, totalH, {
        fg: [80, 90, 105] as [number, number, number],
        border: "round",
        fill: [30, 33, 40] as [number, number, number],
      });

      // title + counts
      s.draw.text(x + Math.floor((dialogW - 15) / 2), y, " Diagnostics ", {
        fg: [230, 200, 100] as [number, number, number],
      });
      const counts: string[] = [];
      if (errors > 0) counts.push(`✗ ${errors}`);
      if (warnings > 0) counts.push(`⚠ ${warnings}`);
      if (counts.length > 0) {
        const countText = ` ${counts.join("  ")} `;
        s.draw.text(x + dialogW - countText.length - 1, y, countText, {
          fg:
            errors > 0
              ? ([255, 80, 80] as [number, number, number])
              : ([229, 192, 123] as [number, number, number]),
        });
      }

      // hint
      s.draw.text(x + 2, y + 1, "↑↓ Navigate  Enter Jump  Esc Close", {
        fg: [70, 75, 85] as [number, number, number],
        bg: [30, 33, 40] as [number, number, number],
      });

      // separator
      for (let i = 1; i < dialogW - 1; i++) {
        s.draw.char(x + i, y + 2, "─", { fg: [80, 90, 105] as [number, number, number] });
      }

      // list
      drawList(s.draw, {
        x: x + 1,
        y: y + 3,
        width: dialogW - 2,
        height: listH,
        items: listItems,
        selectedIndex: listState.selectedIndex,
        scrollOffset: listState.scrollOffset,
        bg: [30, 33, 40] as [number, number, number],
      });

      s.screen.hideCursor();
      s.draw.flush();
    }

    function onData(data: Buffer) {
      if (data[0] === 0x1b && data.length === 1) {
        cleanup();
        s.dialogOpen = false;
        s.update();
        resolve();
        return;
      }

      if (data[0] === 13 && diags.length > 0) {
        cleanup();
        s.dialogOpen = false;
        const d = diags[listState.selectedIndex];
        s.cm.primary.y = d.line;
        s.cm.primary.x = d.col;
        s.cm.primary.anchor = null;
        s.cm.clearExtras();
        s.update();
        resolve();
        return;
      }

      if (data[0] === 0x1b && data[1] === 0x5b) {
        const seq = data.toString("utf8", 2);
        if (seq === "A" && diags.length > 0) {
          listState = listMoveUp(listState, diags.length);
          renderDiag();
        }
        if (seq === "B" && diags.length > 0) {
          listState = listMoveDown(listState, diags.length, listH);
          renderDiag();
        }
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
    }

    process.stdin.on("data", onData);
    renderDiag();
  });
}
