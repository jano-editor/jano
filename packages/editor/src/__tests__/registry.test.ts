import { describe, it, expect } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";

// isolate plugin dirs before importing (paths are captured at import time)
process.env.JANO_HOME ??= mkdtempSync(join(tmpdir(), "jano-registry-test-"));
const { stagePlugin } = await import("../plugins/registry.ts");
const { getPluginsDir } = await import("../plugins/config.ts");

function zipOf(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
  return zip.toBuffer();
}

const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: "demo",
    version: "1.0.0",
    api: 1,
    description: "demo plugin",
    extensions: [".demo"],
    entry: "index.js",
    ...extra,
  });

// staging dirs are hidden dot dirs inside the plugins dir
const leftovers = () => readdirSync(getPluginsDir()).filter((d) => d.startsWith(".demo-install-"));

describe("stagePlugin", () => {
  it("extracts a valid plugin into a staging dir", () => {
    const dir = stagePlugin(
      zipOf({ "plugin.json": manifest(), "index.js": "export default {}" }),
      "demo",
    );
    expect(existsSync(join(dir, "plugin.json"))).toBe(true);
    expect(existsSync(join(dir, "index.js"))).toBe(true);
    rmSync(dir, { recursive: true });
  });

  it("rejects archives without plugin.json and cleans up", () => {
    expect(() => stagePlugin(zipOf({ "index.js": "" }), "demo")).toThrow("no plugin.json");
    expect(leftovers()).toEqual([]);
  });

  it("rejects plugins that need a newer API", () => {
    const zip = zipOf({ "plugin.json": manifest({ api: 99 }), "index.js": "" });
    expect(() => stagePlugin(zip, "demo")).toThrow("jano update");
    expect(leftovers()).toEqual([]);
  });

  it("rejects a missing entry file", () => {
    expect(() => stagePlugin(zipOf({ "plugin.json": manifest() }), "demo")).toThrow("index.js");
  });

  it("rejects archives that would write outside the staging dir (zip slip)", () => {
    const zip = new AdmZip();
    zip.addFile("plugin.json", Buffer.from(manifest()));
    zip.addFile("index.js", Buffer.from(""));
    zip.addFile("x.js", Buffer.from("evil"));
    // adm-zip normalizes names on addFile, so set the raw entry name afterwards
    zip.getEntry("x.js")!.entryName = "../evil.js";
    expect(() => stagePlugin(zip.toBuffer(), "demo")).toThrow("unsafe path");
    expect(existsSync(join(getPluginsDir(), "evil.js"))).toBe(false);
    expect(leftovers()).toEqual([]);
  });
});
