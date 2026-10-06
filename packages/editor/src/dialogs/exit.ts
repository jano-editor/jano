import { showDialog } from "@jano-editor/ui";
import type { Session } from "./session.ts";
import { trySave, saveWithDialog } from "./save.ts";

function quit(s: Session): never {
  s.backup.discard();
  s.screen.leave();
  process.exit(0);
}

export async function confirmExit(s: Session): Promise<void> {
  if (!s.editor.dirty) quit(s);

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
      const saved = s.editor.filePath
        ? await trySave(s, s.editor.filePath)
        : await saveWithDialog(s);
      if (!saved) {
        s.update();
        return;
      }
      quit(s);
    }
    if (result.value === "discard") quit(s);
  }

  s.update();
}
