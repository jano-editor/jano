import {
  chownSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { log } from "./utils/logger.ts";

// Hot-exit style backups of unsaved buffers. Every jano process owns one backup
// file named "<pid>-<startTime>.json". A backup whose pid is no longer running
// belongs to a crashed session and can be recovered.

export interface BackupData {
  version: 1;
  pid: number;
  filePath: string; // absolute, "" for untitled buffers
  savedAt: number;
  content: string;
}

export interface BackupEntry extends BackupData {
  id: string;
  lineCount: number;
}

export interface BackupSource {
  lines: string[];
  filePath: string;
  dirty: boolean;
}

export interface BackupManager {
  /** Debounced async write while dirty. Removes the backup once the buffer is clean. */
  schedule(state: BackupSource): void;
  /** Sync write, for crash handlers and right after a restore. */
  writeNow(state: BackupSource): void;
  /** Sync delete of this session's backup (clean exit, discard). */
  discard(): void;
}

export interface BackupTiming {
  idleMs: number;
  maxWaitMs: number;
}

const DEFAULT_TIMING: BackupTiming = { idleMs: 2000, maxWaitMs: 10000 };

export function createBackupManager(
  dir: string,
  timing: BackupTiming = DEFAULT_TIMING,
): BackupManager {
  const id = `${process.pid}-${Date.now()}.json`;
  const path = join(dir, id);

  let source: BackupSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt = 0;
  let writing = false;
  let rerun = false;
  let exists = false;
  let tmpSeq = 0;
  // bumped by discard() and writeNow() so an in-flight async write knows it is stale
  let generation = 0;
  let syncData: string | null = null;

  const nextTmp = () => `${path}.${++tmpSeq}.tmp`;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
    firstPendingAt = 0;
  }

  async function flush() {
    clearTimer();
    if (!source?.dirty) return;
    if (writing) {
      rerun = true;
      log.debug({ action: "backup_skipped_busy" });
      return;
    }

    writing = true;
    const gen = generation;
    const tmp = nextTmp();
    const data = serialize(source);
    try {
      ensureDir(dir);
      await writeFile(tmp, data, { mode: 0o600 });
      if (gen !== generation) {
        await unlink(tmp).catch(() => {});
        return;
      }
      await rename(tmp, path);
      exists = true;
      if (gen !== generation) {
        // discard() or writeNow() ran while the rename was in flight
        if (syncData) writeAtomicSync(path, syncData);
        else unlinkQuiet(path);
        return;
      }
      log.debug({ action: "backup_write_done", id, bytes: data.length });
    } catch (err) {
      log.warn({ action: "backup_write_failed", id, error: errorMessage(err) });
    } finally {
      writing = false;
      if (rerun) {
        rerun = false;
        void flush();
      }
    }
  }

  function discard() {
    clearTimer();
    generation++;
    rerun = false;
    syncData = null;
    // unlink even if no write finished yet, an in-flight rename may just have landed
    unlinkQuiet(path);
    if (exists) log.debug({ action: "backup_discarded", id });
    exists = false;
  }

  return {
    schedule(state) {
      source = state;
      if (!state.dirty) {
        if (exists || timer || writing) discard();
        return;
      }
      const now = Date.now();
      if (!firstPendingAt) firstPendingAt = now;
      if (timer) clearTimeout(timer);
      const wait = Math.min(timing.idleMs, firstPendingAt + timing.maxWaitMs - now);
      timer = setTimeout(() => void flush(), Math.max(0, wait));
      timer.unref?.();
    },

    writeNow(state) {
      clearTimer();
      if (!state.dirty) return;
      generation++;
      try {
        ensureDir(dir);
        syncData = serialize(state);
        writeAtomicSync(path, syncData);
        exists = true;
        log.info({ action: "backup_write_sync", id });
      } catch (err) {
        log.error({ action: "backup_write_failed", id, error: errorMessage(err) });
      }
    },

    discard,
  };
}

/** Backups left behind by jano processes that are no longer running, newest first. */
export function listOrphanedBackups(dir: string): BackupEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const entries: BackupEntry[] = [];
  for (const name of names) {
    const pid = parseInt(name, 10);
    if (!pid || pid === process.pid || isAlive(pid)) continue;

    // half-written temp files of dead sessions are useless
    if (name.endsWith(".tmp")) {
      unlinkQuiet(join(dir, name));
      continue;
    }
    if (!name.endsWith(".json")) continue;

    try {
      const data = JSON.parse(readFileSync(join(dir, name), "utf8")) as BackupData;
      if (data.version !== 1 || typeof data.content !== "string") continue;
      entries.push({ ...data, id: name, lineCount: data.content.split("\n").length });
    } catch (err) {
      log.warn({ action: "backup_read_failed", id: name, error: errorMessage(err) });
    }
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteBackup(dir: string, id: string): void {
  unlinkQuiet(join(dir, id));
}

function serialize(state: BackupSource): string {
  const data: BackupData = {
    version: 1,
    pid: process.pid,
    filePath: state.filePath ? resolve(state.filePath) : "",
    savedAt: Date.now(),
    content: state.lines.join("\n"),
  };
  return JSON.stringify(data);
}

function writeAtomicSync(path: string, data: string) {
  const tmp = `${path}.sync.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, path);
}

function ensureDir(dir: string) {
  const created = mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!created) return;

  // under sudo, hand new dirs back to the real user so their own jano can still write here.
  // the backup files themselves stay root-owned (0600), so root's content stays private.
  const uid = Number(process.env.SUDO_UID);
  const gid = Number(process.env.SUDO_GID);
  if (process.getuid?.() !== 0 || !uid) return;
  for (let d = dir; d.length >= created.length; d = dirname(d)) {
    chownSync(d, uid, gid || uid);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to another user
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function unlinkQuiet(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
