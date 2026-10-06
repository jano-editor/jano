import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBackupManager, listOrphanedBackups, deleteBackup } from "../backup.ts";

const timing = { idleMs: 10, maxWaitMs: 40 };
// above the default linux pid_max, so never alive
const DEAD_PID = 999_999_999;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jano-backup-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const files = () => readdirSync(dir);

function writeOrphan(pid: number, content: string, savedAt = Date.now()) {
  const id = `${pid}-${savedAt}.json`;
  writeFileSync(
    join(dir, id),
    JSON.stringify({ version: 1, pid, filePath: "/tmp/a.txt", savedAt, content }),
  );
  return id;
}

describe("createBackupManager", () => {
  it("writes a backup after the idle delay", async () => {
    const mgr = createBackupManager(dir, timing);
    mgr.schedule({ lines: ["hello", "world"], filePath: "rel.txt", dirty: true });
    expect(files()).toEqual([]);

    await sleep(50);
    const [name] = files();
    const data = JSON.parse(readFileSync(join(dir, name), "utf8"));
    expect(data.content).toBe("hello\nworld");
    expect(data.filePath).toBe(resolve("rel.txt"));
    expect(data.pid).toBe(process.pid);
  });

  it("does nothing while the buffer is clean", async () => {
    const mgr = createBackupManager(dir, timing);
    mgr.schedule({ lines: ["x"], filePath: "", dirty: false });
    await sleep(50);
    expect(files()).toEqual([]);
  });

  it("removes the backup once the buffer is clean again", async () => {
    const mgr = createBackupManager(dir, timing);
    const state = { lines: ["x"], filePath: "", dirty: true };
    mgr.schedule(state);
    await sleep(50);
    expect(files()).toHaveLength(1);

    state.dirty = false;
    mgr.schedule(state);
    expect(files()).toEqual([]);
  });

  it("leaves no file when discarded during an in-flight write", async () => {
    const mgr = createBackupManager(dir, { idleMs: 0, maxWaitMs: 0 });
    mgr.schedule({ lines: ["x"], filePath: "", dirty: true });
    // let the timer fire so the async write starts, then discard right away
    await sleep(1);
    mgr.discard();
    await sleep(30);
    expect(files()).toEqual([]);
  });

  it("writeNow writes synchronously", () => {
    const mgr = createBackupManager(dir, timing);
    mgr.writeNow({ lines: ["crash"], filePath: "", dirty: true });
    const [name] = files();
    expect(JSON.parse(readFileSync(join(dir, name), "utf8")).content).toBe("crash");
  });
});

describe("listOrphanedBackups", () => {
  it("lists backups of dead processes only", () => {
    const orphan = writeOrphan(DEAD_PID, "a\nb");
    writeOrphan(process.pid, "mine");

    const entries = listOrphanedBackups(dir);
    expect(entries.map((e) => e.id)).toEqual([orphan]);
    expect(entries[0].lineCount).toBe(2);
  });

  it("sorts newest first", () => {
    const older = writeOrphan(DEAD_PID, "old", 1000);
    const newer = writeOrphan(DEAD_PID, "new", 2000);
    expect(listOrphanedBackups(dir).map((e) => e.id)).toEqual([newer, older]);
  });

  it("skips broken files and cleans up dead temp files", () => {
    writeFileSync(join(dir, `${DEAD_PID}-1.json`), "{not json");
    writeFileSync(join(dir, `${DEAD_PID}-2.json.1.tmp`), "partial");

    expect(listOrphanedBackups(dir)).toEqual([]);
    expect(files()).toEqual([`${DEAD_PID}-1.json`]);
  });

  it("ignores files that don't match the backup name pattern", () => {
    writeFileSync(join(dir, `${DEAD_PID}abc.json`), "{}");
    writeFileSync(join(dir, `${DEAD_PID}-1.json.bak`), "{}");
    expect(listOrphanedBackups(dir)).toEqual([]);
    expect(files()).toHaveLength(2);
  });

  it("skips backups with missing or wrongly typed fields", () => {
    const base = { version: 1, pid: DEAD_PID, content: "x" };
    writeFileSync(join(dir, `${DEAD_PID}-1.json`), JSON.stringify({ ...base, savedAt: 1 }));
    writeFileSync(
      join(dir, `${DEAD_PID}-2.json`),
      JSON.stringify({ ...base, filePath: "/a", savedAt: "yesterday" }),
    );
    expect(listOrphanedBackups(dir)).toEqual([]);
  });

  it("returns an empty list when the dir does not exist", () => {
    expect(listOrphanedBackups(join(dir, "missing"))).toEqual([]);
  });

  it("deleteBackup removes the file", () => {
    const id = writeOrphan(DEAD_PID, "x");
    deleteBackup(dir, id);
    expect(files()).toEqual([]);
  });
});
