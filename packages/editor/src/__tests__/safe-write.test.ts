import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSafely, canKeepOwner } from "../safe-write.ts";

let dir: string;
const isRoot = process.getuid?.() === 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jano-safe-write-"));
});

afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const noTempFiles = () => readdirSync(dir).filter((f) => f.endsWith(".tmp"));

describe("writeFileSafely", () => {
  it("creates a new file atomically", () => {
    const file = join(dir, "new.txt");
    expect(writeFileSafely(file, "hello")).toBe("atomic");
    expect(readFileSync(file, "utf8")).toBe("hello");
    expect(noTempFiles()).toEqual([]);
  });

  it("keeps the permissions of an existing file, including group write", () => {
    const file = join(dir, "script.sh");
    writeFileSync(file, "old");
    chmodSync(file, 0o775);
    writeFileSafely(file, "new");
    expect(statSync(file).mode & 0o777).toBe(0o775);
    expect(readFileSync(file, "utf8")).toBe("new");
  });

  it("writes through a symlink and keeps the link", () => {
    const real = join(dir, "real.txt");
    const link = join(dir, "link.txt");
    writeFileSync(real, "old");
    symlinkSync(real, link);
    writeFileSafely(link, "new");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, "utf8")).toBe("new");
  });

  it("keeps hard links together by writing in place", () => {
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    writeFileSync(a, "old");
    linkSync(a, b);
    expect(writeFileSafely(a, "new")).toBe("direct");
    expect(readFileSync(b, "utf8")).toBe("new");
  });

  it.skipIf(isRoot)("falls back to writing in place when the folder is read only", () => {
    const file = join(dir, "config");
    writeFileSync(file, "old");
    chmodSync(dir, 0o555);
    expect(writeFileSafely(file, "new")).toBe("direct");
    expect(readFileSync(file, "utf8")).toBe("new");
  });

  it.skipIf(isRoot)("refuses a read-only file like a plain write would", () => {
    const file = join(dir, "readonly.txt");
    writeFileSync(file, "old");
    chmodSync(file, 0o444);
    expect(() => writeFileSafely(file, "new")).toThrow();
    expect(readFileSync(file, "utf8")).toBe("old");
  });

  it("creates the target of a dangling symlink and keeps the link", () => {
    const link = join(dir, "link.txt");
    symlinkSync("missing.txt", link);
    writeFileSafely(link, "new");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(dir, "missing.txt"), "utf8")).toBe("new");
  });

  it("refuses a symlink loop instead of replacing the link", () => {
    const a = join(dir, "a");
    const b = join(dir, "b");
    symlinkSync(b, a);
    symlinkSync(a, b);
    expect(() => writeFileSafely(a, "new")).toThrow();
    expect(lstatSync(a).isSymbolicLink()).toBe(true);
  });

  it("keeps setuid and setgid bits", () => {
    const file = join(dir, "tool");
    writeFileSync(file, "old");
    chmodSync(file, 0o6755);
    writeFileSafely(file, "new");
    expect(statSync(file).mode & 0o7777).toBe(0o6755);
  });

  it("fails on a folder without touching it or leaving temp files", () => {
    const target = join(dir, "folder");
    mkdirSync(join(target, "inner"), { recursive: true });
    expect(() => writeFileSafely(target, "new")).toThrow();
    expect(statSync(join(target, "inner")).isDirectory()).toBe(true);
    expect(noTempFiles()).toEqual([]);
  });
});

describe("canKeepOwner", () => {
  it("root can always keep the owner", () => {
    expect(canKeepOwner({ uid: 1000, gid: 1000 }, { uid: 0, groups: [] })).toBe(true);
  });

  it("a normal user only for own files with one of their groups", () => {
    const bob = { uid: 1000, groups: [50, 1000] };
    expect(canKeepOwner({ uid: 1000, gid: 50 }, bob)).toBe(true);
    // someone else's file, e.g. alice:dev edited by bob via the group
    expect(canKeepOwner({ uid: 1001, gid: 50 }, bob)).toBe(false);
    // own file, but a group we are not in
    expect(canKeepOwner({ uid: 1000, gid: 77 }, bob)).toBe(false);
  });

  it("windows has no unix owners", () => {
    expect(canKeepOwner({ uid: 1, gid: 1 }, { uid: undefined, groups: [] })).toBe(true);
  });
});
