import { existsSync } from "node:fs";
import { showDialog } from "@jano-editor/ui";
import { saveAs } from "../editor.ts";
import type { Session } from "./session.ts";

export async function trySave(s: Session, filePath: string): Promise<boolean> {
  // overwrite warning if target exists and isn't the current file
  if (existsSync(filePath) && filePath !== s.editor.filePath) {
    s.dialogOpen = true;
    const confirm = await showDialog(
      s.screen,
      s.draw,
      {
        title: "Overwrite?",
        message: `"${filePath}" already exists. Overwrite?`,
        buttons: [
          { label: "Overwrite", value: "yes" },
          { label: "Cancel", value: "no" },
        ],
        border: "round",
      },
      s.update,
    );
    s.dialogOpen = false;
    if (confirm.type !== "button" || confirm.value !== "yes") return false;
  }

  try {
    saveAs(s.editor, filePath);
    s.reloadPlugin();
    return true;
  } catch (err) {
    s.dialogOpen = true;
    await showDialog(
      s.screen,
      s.draw,
      {
        title: "Error",
        message: `Could not save: ${err instanceof Error ? err.message : String(err)}`,
        buttons: [{ label: "OK", value: "ok" }],
        border: "round",
      },
      s.update,
    );
    s.dialogOpen = false;
    return false;
  }
}

export async function saveWithDialog(s: Session): Promise<void> {
  s.dialogOpen = true;

  const result = await showDialog(
    s.screen,
    s.draw,
    {
      title: "Save As",
      message: "Enter file name:",
      input: true,
      inputPlaceholder: "filename.ext",
      buttons: [
        { label: "Save", value: "save" },
        { label: "Cancel", value: "cancel" },
      ],
      border: "round",
      width: 50,
    },
    s.update,
  );

  s.dialogOpen = false;

  let targetPath = "";
  if (result.type === "button" && result.value === "save" && result.inputValue) {
    targetPath = result.inputValue;
  } else if (result.type === "input" && result.value) {
    targetPath = result.value;
  }

  if (targetPath) {
    await trySave(s, targetPath);
  }

  s.update();
}
