import { showDialog } from "@jano-editor/ui";
import type { Session } from "./session.ts";

export async function showHistory(s: Session): Promise<void> {
  const history = s.undo.getHistory();

  if (history.length === 0) {
    await showDialog(
      s.input,
      s.screen,
      s.draw,
      {
        title: "History",
        message: "No changes recorded yet.",
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      s.update,
    );
    s.update();
    return;
  }

  const items: string[] = ["  0. Original file"];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const desc = s.undo.describeEntry(entry);
    const marker = i === history.length - 1 ? "▸" : " ";
    items.push(`${marker} ${i + 1}. [${time}] ${desc}`);
  }

  const result = await showDialog(
    s.input,
    s.screen,
    s.draw,
    {
      title: `History (${history.length} changes)`,
      message: items.slice(-15).join("\n"),
      input: true,
      inputPlaceholder: "Number (0 = original)...",
      buttons: [
        { label: "Jump", value: "jump" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
      width: 60,
    },
    s.update,
  );

  if (result.type === "input" || (result.type === "button" && result.value === "jump")) {
    const inputVal = result.type === "input" ? result.value : (result.inputValue ?? "");
    const idx = parseInt(inputVal, 10);

    if (idx === 0) {
      while (true) {
        const undone = s.undo.undo(s.editor.lines, s.cm.primary);
        if (!undone) break;
        s.editor.lines = undone.lines;
        if (undone.cursorState) s.cm.restoreState(undone.cursorState);
      }
      s.editor.dirty = false;
    } else if (idx >= 1 && idx <= history.length) {
      s.editor.lines = s.undo.jumpTo(idx - 1, s.editor.lines, s.cm.primary);
      s.editor.dirty = true;
    }
  }

  s.update();
}
