import { showDialog } from "@jano-editor/ui";
import type { Session } from "./session.ts";

export async function openGoto(s: Session): Promise<void> {
  const total = s.editor.lines.length;
  const current = s.cm.primary.y + 1;

  const result = await showDialog(
    s.input,
    s.screen,
    s.draw,
    {
      title: `Go to Line (1-${total})`,
      message: `Current: line ${current}`,
      input: true,
      inputPlaceholder: "Line number, 'start' or 'end'...",
      buttons: [
        { label: "Go", value: "go" },
        { label: "Start", value: "start" },
        { label: "End", value: "end" },
      ],
      border: "round",
      width: 45,
    },
    s.update,
  );

  const p = s.cm.primary;
  s.cm.clearExtras();
  p.anchor = null;

  if (result.type === "button") {
    if (result.value === "start") {
      p.y = 0;
      p.x = 0;
    } else if (result.value === "end") {
      p.y = s.editor.lines.length - 1;
      p.x = 0;
    } else if (result.value === "go") {
      const inputVal = result.inputValue ?? "";
      const line = parseInt(inputVal, 10);
      if (line >= 1 && line <= s.editor.lines.length) {
        p.y = line - 1;
        p.x = 0;
      }
    }
  } else if (result.type === "input") {
    const val = result.value.trim().toLowerCase();
    if (val === "start" || val === "s") {
      p.y = 0;
      p.x = 0;
    } else if (val === "end" || val === "e") {
      p.y = s.editor.lines.length - 1;
      p.x = 0;
    } else {
      const line = parseInt(val, 10);
      if (line >= 1 && line <= s.editor.lines.length) {
        p.y = line - 1;
        p.x = 0;
      }
    }
  }

  s.update();
}
