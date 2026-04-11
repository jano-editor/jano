import { showDialog } from "@jano-editor/ui";
import type { Session } from "./session.ts";
import { trySave, saveWithDialog } from "./save.ts";

export async function confirmExit(s: Session): Promise<void> {
  if (!s.editor.dirty) {
    s.screen.leave();
    process.exit(0);
  }

  const result = await showDialog(
    s.input,
    s.screen,
    s.draw,
    {
      title: "Unsaved Changes",
      message: `Save changes to "${s.editor.filePath || "untitled"}" before closing?`,
      buttons: [
        { label: "Save", value: "save" },
        { label: "Discard", value: "discard" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
    },
    s.update,
  );

  if (result.type === "button") {
    if (result.value === "save") {
      if (!s.editor.filePath) {
        await saveWithDialog(s);
        if (!s.editor.filePath) {
          s.update();
          return;
        }
      } else {
        const ok = await trySave(s, s.editor.filePath);
        if (!ok) {
          s.update();
          return;
        }
      }
      s.screen.leave();
      process.exit(0);
    }
    if (result.value === "discard") {
      s.screen.leave();
      process.exit(0);
    }
  }

  s.update();
}
