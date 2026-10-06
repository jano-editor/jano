import { describe, it, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolate cache dir before importing version-check (which transitively imports config)
process.env.JANO_HOME = mkdtempSync(join(tmpdir(), "jano-vc-test-"));

const { compareVersions, pickLatestEditorRelease, editorVersion, checksumFor } =
  await import("../utils/version-check.ts");

describe("compareVersions", () => {
  it("compares equal versions as 0", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.1")).toBe(0);
  });

  it("compares major/minor/patch correctly", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
  });

  it("treats no prerelease as greater than prerelease", () => {
    expect(compareVersions("1.0.0", "1.0.0-alpha.1")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0")).toBeLessThan(0);
  });

  it("compares alpha versions numerically, not lexically", () => {
    // "alpha.16" vs "alpha.17" - critical: must not compare as strings
    expect(compareVersions("1.0.0-alpha.16", "1.0.0-alpha.17")).toBeLessThan(0);
    // "alpha.9" vs "alpha.10" - lexical would be wrong (9 > 10 as string)
    expect(compareVersions("1.0.0-alpha.9", "1.0.0-alpha.10")).toBeLessThan(0);
  });

  it("handles missing patch/minor", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("pickLatestEditorRelease", () => {
  const rel = (tag_name: string, draft = false) => ({ tag_name, draft, assets: [] });

  it("ignores ui and plugin-types releases even when they are newer", () => {
    const picked = pickLatestEditorRelease([
      rel("ui-v1.0.0-alpha.8"),
      rel("plugin-types-v1.0.0"),
      rel("editor-v1.0.0-alpha.18"),
    ]);
    expect(picked && editorVersion(picked)).toBe("1.0.0-alpha.18");
  });

  it("picks the highest version, not the first one listed", () => {
    const picked = pickLatestEditorRelease([rel("editor-v1.0.0-alpha.9"), rel("editor-v1.0.0")]);
    expect(picked && editorVersion(picked)).toBe("1.0.0");
  });

  it("skips drafts", () => {
    const picked = pickLatestEditorRelease([rel("editor-v2.0.0", true), rel("editor-v1.0.0")]);
    expect(picked && editorVersion(picked)).toBe("1.0.0");
  });

  it("returns null without editor releases", () => {
    expect(pickLatestEditorRelease([rel("ui-v1.0.0")])).toBeNull();
  });
});

describe("checksumFor", () => {
  const a = "a".repeat(64);
  const b = "B".repeat(64);
  const sums = `${a}  jano-linux-x64\n${b} *jano-darwin-arm64\n`;

  it("finds the hash for a file", () => {
    expect(checksumFor(sums, "jano-linux-x64")).toBe(a);
  });

  it("supports binary mode markers and normalizes case", () => {
    expect(checksumFor(sums, "jano-darwin-arm64")).toBe("b".repeat(64));
  });

  it("returns null for unknown files or broken hashes", () => {
    expect(checksumFor(sums, "jano-linux-arm64")).toBeNull();
    expect(checksumFor("xyz  jano-linux-x64", "jano-linux-x64")).toBeNull();
  });
});
