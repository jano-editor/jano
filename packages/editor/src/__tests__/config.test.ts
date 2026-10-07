import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Set JANO_HOME BEFORE importing the module — paths are captured at import time.
// Note: if another test imports config.ts first, its JANO_HOME wins. We use the
// actually-resolved path via getPaths() to stay robust against test ordering.
const tmp = mkdtempSync(join(tmpdir(), "jano-test-"));
const originalHome = process.env.JANO_HOME;
process.env.JANO_HOME = tmp;

// Now import after env is set
const { loadConfig, saveConfig, getPaths, getPluginDir, isValidPluginName } =
  await import("../plugins/config.ts");

const configPath = join(getPaths().config, "config.json");

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
      startupAnimation: true,
      pluginRecommendations: true,
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
        editor: {
          tabSize: 8,
          insertSpaces: false,
          lineNumbers: false,
          autoComplete: false,
          startupAnimation: false,
          pluginRecommendations: false,
        },
      }),
    );
    const loaded = loadConfig();
    expect(loaded.editor).toEqual({
      tabSize: 8,
      insertSpaces: false,
      lineNumbers: false,
      autoComplete: false,
      startupAnimation: false,
      pluginRecommendations: false,
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
      startupAnimation: true,
      pluginRecommendations: true,
    });
  });

  it("saveConfig persists editor settings to disk", () => {
    saveConfig({
      plugins: {},
      editor: {
        tabSize: 4,
        insertSpaces: false,
        lineNumbers: true,
        autoComplete: true,
        startupAnimation: true,
        pluginRecommendations: true,
      },
    });

    const reloaded = loadConfig();
    expect(reloaded.editor).toEqual({
      tabSize: 4,
      insertSpaces: false,
      lineNumbers: true,
      autoComplete: true,
      startupAnimation: true,
      pluginRecommendations: true,
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

describe("plugin names", () => {
  it("accepts registry style names", () => {
    for (const name of ["json", "yaml", "plugin-markdown", "my_plugin", "v2.0", "Docker"]) {
      expect(isValidPluginName(name)).toBe(true);
    }
  });

  it("rejects anything that could leave the plugins dir", () => {
    for (const name of [
      "..",
      ".",
      "../x",
      "../../..",
      "a/b",
      "a\\b",
      "/etc",
      ".hidden",
      "",
      "a\0b",
    ]) {
      expect(isValidPluginName(name)).toBe(false);
      expect(() => getPluginDir(name)).toThrow("Invalid plugin name");
    }
  });

  it("resolves valid names inside the plugins dir", () => {
    expect(getPluginDir("json")).toBe(join(getPaths().plugins, "json"));
  });
});
