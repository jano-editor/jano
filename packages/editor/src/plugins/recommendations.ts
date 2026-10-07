import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPaths, getPluginDir, isValidPluginName } from "./config.ts";
import type { RegistryPlugin } from "./registry.ts";

// Remembers which plugins the welcome dialog already offered and the user decided on,
// so deselecting one doesn't bring the dialog back on every start. Only plugins that
// are new in the registry are offered again.

function seenFile(): string {
  return join(getPaths().data, "recommendations-seen.json");
}

export function loadSeen(): Set<string> {
  try {
    const data: unknown = JSON.parse(readFileSync(seenFile(), "utf8"));
    return new Set(Array.isArray(data) ? data.filter((n) => typeof n === "string") : []);
  } catch {
    return new Set();
  }
}

export function markSeen(names: string[]): void {
  const seen = loadSeen();
  for (const name of names) seen.add(name);
  const file = seenFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify([...seen].sort()));
}

/** Registry plugins worth offering: not installed, not decided on before, most downloaded first. */
export function pickRecommendations(
  available: RegistryPlugin[],
  seen: Set<string> = loadSeen(),
): RegistryPlugin[] {
  return available
    .filter((p) => isValidPluginName(p.name) && !seen.has(p.name))
    .filter((p) => !existsSync(getPluginDir(p.name)))
    .sort((a, b) => b.totalDownloads - a.totalDownloads);
}
