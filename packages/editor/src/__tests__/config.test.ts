import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Set JANO_HOME BEFORE importing the module — paths are captured at import time
const tmp = mkdtempSync(join(tmpdir(), "jano-test-"));
const originalHome = process.env.JANO_HOME;
process.env.JANO_HOME = tmp;

// Now import after env is set
const { loadConfig, saveConfig } = await import("../plugins/config.ts");

const configPath = join(tmp, "config.json");

beforeAll(() => {
  // ensure tmp dir exists (mkdtempSync already does that)
});

beforeEach(() => {
  if (existsSync(configPath)) unlinkSync(configPath);
});

afterAll(() => {
  if (originalHome === undefined) delete process.env.JANO_HOME;
  else process.env.JANO_HOME = originalHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe("config: editor settings", () => {
  it("returns defaults when no config file exists", () => {
    const loaded = loadConfig();
    expect(loaded.editor).toEqual({
      tabSize: 2,
      insertSpaces: true,
      lineNumbers: true,
      autoComplete: true,
    });
    expect(loaded.plugins).toEqual({});
  });

  it("merges partial editor block with defaults", () => {
    writeFileSync(configPath, JSON.stringify({ editor: { tabSize: 4 } }));
    const loaded = loadConfig();
    expect(loaded.editor.tabSize).toBe(4);
    expect(loaded.editor.insertSpaces).toBe(true);
    expect(loaded.editor.lineNumbers).toBe(true);
    expect(loaded.editor.autoComplete).toBe(true);
  });

  it("loads complete editor block", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        editor: { tabSize: 8, insertSpaces: false, lineNumbers: false, autoComplete: false },
      }),
    );
    const loaded = loadConfig();
    expect(loaded.editor).toEqual({
      tabSize: 8,
      insertSpaces: false,
      lineNumbers: false,
      autoComplete: false,
    });
  });

  it("returns defaults on malformed JSON", () => {
    writeFileSync(configPath, "{ not json");
    const loaded = loadConfig();
    expect(loaded.editor).toEqual({
      tabSize: 2,
      insertSpaces: true,
      lineNumbers: true,
      autoComplete: true,
    });
  });

  it("saveConfig persists editor settings to disk", () => {
    saveConfig({
      plugins: {},
      editor: { tabSize: 4, insertSpaces: false, lineNumbers: true, autoComplete: true },
    });

    const reloaded = loadConfig();
    expect(reloaded.editor).toEqual({
      tabSize: 4,
      insertSpaces: false,
      lineNumbers: true,
      autoComplete: true,
    });
  });

  it("preserves plugins block when loading", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        plugins: { yaml: { enabled: false } },
        editor: { tabSize: 4 },
      }),
    );
    const loaded = loadConfig();
    expect(loaded.plugins.yaml?.enabled).toBe(false);
    expect(loaded.editor.tabSize).toBe(4);
  });
});
