import { existsSync } from "node:fs";
import { showDialog } from "@jano-editor/ui";
import { saveAs } from "../editor.ts";
import { log } from "../utils/logger.ts";
import { buildContext } from "../plugins/context.ts";
import { applyEditResult } from "../plugins/apply.ts";
import { callPluginHookAsync } from "../plugins/call.ts";
import { getViewDimensions } from "../render.ts";
import type { Session } from "./session.ts";

const SAVE_HOOK_TIMEOUT_MS = 3000;

/** Lets the plugin adjust the document right before it is written. Undoable like any edit. */
async function runSaveHook(s: Session) {
  const plugin = s.plugin;
  if (!plugin?.onSave) return;
  const { viewW, viewH } = getViewDimensions(s.screen, s.editor.lines.length, plugin);
  const ctx = buildContext(s.editor, s.cm, {
    firstLine: s.cm.scrollY,
    lastLine: s.cm.scrollY + viewH,
    width: viewW,
    height: viewH,
  });
  const before = s.editor.lines.join("\n");
  const result = await callPluginHookAsync(
    plugin,
    "onSave",
    () => plugin.onSave!(ctx),
    SAVE_HOOK_TIMEOUT_MS,
  );
  if (!result) return;
  if (s.editor.lines.join("\n") !== before) {
    log.info({ action: "plugin_result_stale", plugin: plugin.name, hook: "onSave" });
    return;
  }
  const p = s.cm.primary;
  s.undo.snapshot("save", { x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());
  applyEditResult(result, s.editor, s.cm);
  s.cm.clampAll(s.editor.lines);
  s.undo.commit({ x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());
}

export async function trySave(s: Session, filePath: string): Promise<boolean> {
  const targetExists = existsSync(filePath);
  const isOverwriteOther = targetExists && filePath !== s.editor.filePath;
  log.info({
    action: "file_save_start",
    path: filePath,
    targetExists,
    isOverwriteOther,
    lineCount: s.editor.lines.length,
  });

  // overwrite warning if target exists and isn't the current file
  if (isOverwriteOther) {
    const confirm = await showDialog(
      s.input,
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
    if (confirm.type !== "button" || confirm.value !== "yes") {
      log.info({ action: "file_save_cancelled", reason: "overwrite_declined", path: filePath });
      return false;
    }
  }

  // broken bytes were decoded to U+FFFD on open, writing makes that permanent
  if (s.editor.invalidUtf8) {
    const confirm = await showDialog(
      s.input,
      s.screen,
      s.draw,
      {
        title: "Invalid UTF-8",
        message:
          "This file contains bytes that are not valid UTF-8. Saving replaces them with \uFFFD for good. Save anyway?",
        buttons: [
          { label: "Save anyway", value: "save" },
          { label: "Cancel", value: "cancel" },
        ],
        border: "round",
      },
      s.update,
    );
    if (confirm.type !== "button" || confirm.value !== "save") {
      log.info({ action: "file_save_cancelled", reason: "invalid_utf8", path: filePath });
      return false;
    }
  }

  await runSaveHook(s);

  try {
    const mode = saveAs(s.editor, filePath);
    // written as UTF-8 now, so don't ask again. stays set if the save failed.
    s.editor.invalidUtf8 = false;
    s.reloadPlugin();
    log.info({ action: "file_save_done", path: filePath, mode });
    return true;
  } catch (err) {
    log.error({
      action: "file_save_failed",
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    await showDialog(
      s.input,
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
    return false;
  }
}

export async function saveWithDialog(s: Session): Promise<boolean> {
  const result = await showDialog(
    s.input,
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

  let targetPath = "";
  if (result.type === "button" && result.value === "save" && result.inputValue) {
    targetPath = result.inputValue;
  } else if (result.type === "input" && result.value) {
    targetPath = result.value;
  }

  const saved = targetPath ? await trySave(s, targetPath) : false;
  s.update();
  return saved;
}
