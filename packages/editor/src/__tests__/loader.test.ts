import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolate plugin dirs before importing (paths are captured at import time)
process.env.JANO_HOME ??= mkdtempSync(join(tmpdir(), "jano-loader-test-"));
const { loadPlugins, explainImportError } = await import("../plugins/loader.ts");
const { getPluginsDir } = await import("../plugins/config.ts");

const created: string[] = [];

function plugin(folder: string, files: Record<string, string>) {
  const dir = join(getPluginsDir(), folder);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  created.push(dir);
  return dir;
}

const manifest = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name,
    version: "1.0.0",
    api: 1,
    description: "test",
    extensions: [`.${name}`],
    entry: "index.js",
    ...extra,
  });

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe("loadPlugins errors", async () => {
  plugin("lt-nomanifest", { "index.js": "export default {}" });
  plugin("lt-badjson", { "plugin.json": "{ nope" });
  plugin("lt-incomplete", { "plugin.json": JSON.stringify({ name: "lt-incomplete" }) });
  plugin("lt-newapi", { "plugin.json": manifest("lt-newapi", { api: 99 }), "index.js": "" });
  plugin("lt-noentry", { "plugin.json": manifest("lt-noentry") });
  plugin("lt-syntax", { "plugin.json": manifest("lt-syntax"), "index.js": "export default {" });
  plugin("lt-noexport", {
    "plugin.json": manifest("lt-noexport"),
    "index.js": "export const x = 1",
  });
  plugin("lt-ok", {
    "plugin.json": manifest("lt-ok"),
    "index.js": 'export default { name: "lt-ok", extensions: [".lt-ok"] }',
  });

  const result = await loadPlugins();
  const err = (name: string) => result.errors.find((e) => e.name === name);

  it("explains every broken plugin with why, fix and link", () => {
    for (const name of [
      "lt-nomanifest",
      "lt-badjson",
      "lt-incomplete",
      "lt-newapi",
      "lt-noentry",
      "lt-syntax",
      "lt-noexport",
    ]) {
      const e = err(name);
      expect(e, name).toBeDefined();
      expect(e!.why.length, name).toBeGreaterThan(0);
      expect(e!.fix.length, name).toBeGreaterThan(0);
      expect(e!.link).toStartWith("https://");
    }
  });

  it("names the missing manifest fields", () => {
    expect(err("lt-incomplete")!.why).toContain('"version" is missing');
    expect(err("lt-incomplete")!.why).toContain('"entry" is missing');
  });

  it("points to jano update for a newer API", () => {
    expect(err("lt-newapi")!.fix).toContain("jano update");
  });

  it("recognizes syntax errors", () => {
    expect(err("lt-syntax")!.why).toContain("syntax error");
  });

  it("still loads healthy plugins next to broken ones", () => {
    expect(result.plugins.some((p) => p.manifest.name === "lt-ok")).toBe(true);
  });
});

describe("explainImportError", () => {
  it("explains esbuild's dynamic require error", () => {
    const e = explainImportError(
      "yaml",
      new Error('Dynamic require of "process" is not supported'),
    );
    expect(e.why).toContain('require("process")');
    expect(e.fix).toContain('mark "process" as external');
  });

  it("explains missing bundled dependencies", () => {
    const e = explainImportError(
      "yaml",
      new Error("Cannot find package 'js-yaml' imported from x"),
    );
    expect(e.why).toContain('"js-yaml"');
  });

  it("falls back to the raw message", () => {
    const e = explainImportError("yaml", new Error("something odd"));
    expect(e.why).toBe("something odd");
    expect(e.fix).toContain("jano plugin install yaml");
  });
});
