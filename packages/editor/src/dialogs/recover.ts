import { existsSync, statSync } from "node:fs";
import { basename, dirname } from "node:path";
import { showDialog, drawList, listMoveUp, listMoveDown, type RGB } from "@jano-editor/ui";
import { listOrphanedBackups, deleteBackup, type BackupEntry } from "../backup.ts";
import { getBackupsDir } from "../plugins/config.ts";
import { log } from "../utils/logger.ts";
import type { Session } from "./session.ts";

const BORDER: RGB = [80, 90, 105];
const FILL: RGB = [30, 33, 40];
const MUTED: RGB = [70, 75, 85];
const WARN: RGB = [229, 192, 123];

async function info(s: Session, title: string, message: string): Promise<void> {
  await showDialog(
    s.input,
    s.screen,
    s.draw,
    { title, message, buttons: [{ label: "OK", value: "ok" }], border: "round" },
    s.update,
  );
  s.update();
}

async function confirm(s: Session, title: string, message: string, yes: string): Promise<boolean> {
  const result = await showDialog(
    s.input,
    s.screen,
    s.draw,
    {
      title,
      message,
      buttons: [
        { label: yes, value: "yes" },
        { label: "Cancel", value: "no" },
      ],
      border: "round",
    },
    s.update,
  );
  return result.type === "button" && result.value === "yes";
}

function timeAgo(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** True if the file on disk was modified after the backup was taken. */
function changedOnDisk(entry: BackupEntry): boolean {
  if (!entry.filePath) return false;
  try {
    return statSync(entry.filePath).mtimeMs > entry.savedAt;
  } catch {
    return false;
  }
}

function restore(s: Session, entry: BackupEntry) {
  s.editor.lines = entry.content.split("\n");
  s.editor.filePath = entry.filePath;
  s.editor.isNewFile = !entry.filePath || !existsSync(entry.filePath);
  s.editor.dirty = true;
  s.editor.eol = entry.eol === "\r\n" ? "\r\n" : "\n";
  s.editor.bom = entry.bom === true;
  s.undo.clear();
  s.cm.restoreState({ cursors: [{ x: 0, y: 0, anchor: null }], scrollX: 0, scrollY: 0 });
  s.reloadPlugin();
  s.fileOpened();

  // take over the backup before deleting the orphan, so there is never a gap
  s.backup.writeNow(s.editor);
  deleteBackup(getBackupsDir(), entry.id);
  log.info({ action: "recovery_restored", id: entry.id, filePath: entry.filePath || null });
}

/** Lists backups of crashed sessions and lets the user restore or delete them. */
export async function showRecovery(s: Session): Promise<void> {
  if (s.editor.dirty) {
    await info(s, "Recover", "Please save your changes first.");
    return;
  }

  const entries = listOrphanedBackups(getBackupsDir());
  log.info({ action: "recovery_opened", count: entries.length });
  if (entries.length === 0) {
    await info(s, "Recover", "No unsaved files to recover.");
    return;
  }

  const picked = await pickBackup(s, entries);
  if (!picked) {
    s.update();
    return;
  }

  const name = picked.entry.filePath ? basename(picked.entry.filePath) : "untitled";
  if (picked.action === "delete") {
    if (
      await confirm(
        s,
        "Delete Backup",
        `Delete the backup of "${name}"? This can't be undone.`,
        "Delete",
      )
    ) {
      deleteBackup(getBackupsDir(), picked.entry.id);
      log.info({ action: "recovery_deleted", id: picked.entry.id });
    }
    s.update();
    return;
  }

  if (
    changedOnDisk(picked.entry) &&
    !(await confirm(
      s,
      "File Changed",
      `"${name}" was modified after this backup. Restore the backup anyway?`,
      "Restore",
    ))
  ) {
    s.update();
    return;
  }

  restore(s, picked.entry);
  s.update();
}

type Picked = { action: "restore" | "delete"; entry: BackupEntry } | null;

function pickBackup(s: Session, entries: BackupEntry[]): Promise<Picked> {
  return new Promise((resolve) => {
    const dialogW = Math.min(70, s.screen.width - 4);
    const listH = Math.max(1, Math.min(entries.length, 12, s.screen.height - 8));
    let listState = { selectedIndex: 0, scrollOffset: 0 };
    let backgroundDrawn = false;

    const changed = entries.map(changedOnDisk);
    const items = entries.map((e, i) => ({
      label: ` ${changed[i] ? "⚠" : " "} ${e.filePath ? basename(e.filePath) : "untitled"}`,
      value: e.id,
      description: `${timeAgo(e.savedAt)} · ${e.lineCount} lines `,
    }));

    function renderPicker() {
      if (!backgroundDrawn) {
        // set first: the background render paints open layers, including this dialog
        backgroundDrawn = true;
        s.update();
      }

      // title, hint, separator, list, detail line, bottom border
      const totalH = 3 + listH + 2;
      const x = Math.floor((s.screen.width - dialogW) / 2);
      const y = 1;

      s.draw.rect(x, y, dialogW, totalH, { fg: BORDER, border: "round", fill: FILL });
      const title = " Recover Unsaved Files ";
      s.draw.text(x + Math.floor((dialogW - title.length) / 2), y, title, { fg: [230, 200, 100] });
      s.draw.text(x + 2, y + 1, "↑↓ Navigate  Enter Restore  Del Delete  Esc Close", {
        fg: MUTED,
        bg: FILL,
      });
      for (let i = 1; i < dialogW - 1; i++) {
        s.draw.char(x + i, y + 2, "─", { fg: BORDER });
      }

      drawList(s.draw, {
        x: x + 1,
        y: y + 3,
        width: dialogW - 2,
        height: listH,
        items,
        selectedIndex: listState.selectedIndex,
        scrollOffset: listState.scrollOffset,
        bg: FILL,
      });

      // full path (or the on-disk warning) of the selected entry
      const selected = entries[listState.selectedIndex];
      const detail = changed[listState.selectedIndex]
        ? "⚠ file was modified after this backup"
        : selected.filePath
          ? dirname(selected.filePath)
          : "not saved yet";
      const detailW = dialogW - 4;
      const clipped = detail.length > detailW ? "…" + detail.slice(-(detailW - 1)) : detail;
      s.draw.text(x + 2, y + 3 + listH, clipped.padEnd(detailW), {
        fg: changed[listState.selectedIndex] ? WARN : MUTED,
        bg: FILL,
      });

      s.screen.hideCursor();
      s.draw.flush();
    }

    const layer = s.input.pushLayer("recover", renderPicker);
    const close = (result: Picked) => {
      s.input.popLayer(layer);
      resolve(result);
    };

    layer.on("key", (key) => {
      const entry = entries[listState.selectedIndex];
      if (key.raw.length === 1 && key.raw[0] === 0x1b) close(null);
      else if (key.name === "enter") close({ action: "restore", entry });
      else if (key.name === "delete") close({ action: "delete", entry });
      else if (key.name === "up") {
        listState = listMoveUp(listState, entries.length);
        renderPicker();
      } else if (key.name === "down") {
        listState = listMoveDown(listState, entries.length, listH);
        renderPicker();
      }
      return true;
    });

    // block all other events
    layer.on("mouse:click", () => true);
    layer.on("mouse:drag", () => true);
    layer.on("mouse:release", () => true);
    layer.on("mouse:scroll", () => true);
    layer.on("paste", () => true);

    renderPicker();
  });
}
