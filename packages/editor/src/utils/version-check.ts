import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getCacheDir } from "../plugins/config.ts";

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

const CACHE_FILE = join(getCacheDir(), "version-check.json");
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  checkedAt: number;
  latestVersion: string;
}

interface NpmPackage {
  version: string;
}

// semver comparison: returns negative if a < b, positive if a > b, 0 if equal
// handles prereleases like "1.0.0-alpha.16" vs "1.0.0-alpha.17"
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.split("-");
    const nums = main!.split(".").map(Number);
    return { nums, pre: pre || "" };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const na = pa.nums[i] || 0;
    const nb = pb.nums[i] || 0;
    if (na !== nb) return na - nb;
  }
  // same main version: no prerelease > prerelease
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre, undefined, { numeric: true });
}

function loadCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

function saveCache(entry: CacheEntry) {
  try {
    mkdirSync(getCacheDir(), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(entry), "utf8");
  } catch {
    // ignore cache write errors
  }
}

/**
 * Returns the latest version string if an update is available, otherwise null.
 * Caches the result for 6 hours to avoid hitting the npm registry on every start.
 * Fails silently (offline, network error, etc.) - returns null.
 */
export async function checkIfUpdateAvailable(): Promise<string | null> {
  if (VERSION === "dev") return null;

  const cache = loadCache();
  const now = Date.now();

  // use cached result if still fresh
  if (cache && now - cache.checkedAt < CHECK_INTERVAL) {
    if (compareVersions(VERSION, cache.latestVersion) < 0) {
      return cache.latestVersion;
    }
    return null;
  }

  // fetch latest from npm
  try {
    const res = await fetch("https://registry.npmjs.org/@jano-editor/editor/latest");
    if (res.status !== 200) return null;
    const pkg = (await res.json()) as NpmPackage;

    saveCache({ checkedAt: now, latestVersion: pkg.version });

    if (compareVersions(VERSION, pkg.version) < 0) {
      return pkg.version;
    }
    return null;
  } catch {
    return null;
  }
}
