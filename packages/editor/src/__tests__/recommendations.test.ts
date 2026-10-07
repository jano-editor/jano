import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolate paths before importing (they are captured at import time)
process.env.JANO_HOME ??= mkdtempSync(join(tmpdir(), "jano-reco-test-"));
const { pickRecommendations, markSeen, loadSeen } = await import("../plugins/recommendations.ts");
const { getPluginsDir } = await import("../plugins/config.ts");

const plugin = (name: string, totalDownloads = 0) => ({
  name,
  totalDownloads,
  latestVersion: "1.0.0",
  description: "",
  extensions: [],
  author: "",
});

const installed = join(getPluginsDir(), "reco-installed");
afterAll(() => rmSync(installed, { recursive: true, force: true }));

describe("pickRecommendations", () => {
  it("skips installed and already seen plugins, most downloaded first", () => {
    mkdirSync(installed, { recursive: true });
    const picked = pickRecommendations(
      [
        plugin("reco-small", 1),
        plugin("reco-installed", 99),
        plugin("reco-seen", 50),
        plugin("reco-big", 10),
      ],
      new Set(["reco-seen"]),
    );
    expect(picked.map((p) => p.name)).toEqual(["reco-big", "reco-small"]);
  });

  it("never offers names that could escape the plugins dir", () => {
    expect(pickRecommendations([plugin("../evil")], new Set())).toEqual([]);
  });
});

describe("seen list", () => {
  it("remembers names across loads and merges new ones", () => {
    markSeen(["reco-a"]);
    markSeen(["reco-b", "reco-a"]);
    const seen = loadSeen();
    expect(seen.has("reco-a")).toBe(true);
    expect(seen.has("reco-b")).toBe(true);
  });
});
