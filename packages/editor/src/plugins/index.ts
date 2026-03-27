import { extname, basename } from "node:path";
import type { LanguagePlugin } from "./types.ts";
import { loadPlugins } from "./loader.ts";
import type { LoadedPlugin, LoadResult } from "./loader.ts";

export type { LanguagePlugin, HighlightToken } from "./types.ts";
export { tokenColors } from "./types.ts";
export type { LoadedPlugin, LoadResult } from "./loader.ts";
export { loadConfig, saveConfig, setPluginEnabled, ensureDirs, getPaths } from "./config.ts";
export { installPlugin, checkUpdates, searchPlugins } from "./registry.ts";

let loadedPlugins: LoadedPlugin[] = [];

export async function initPlugins(): Promise<LoadResult> {
  const result = await loadPlugins();
  loadedPlugins = result.plugins;
  return result;
}

export function getLoadedPlugins(): readonly LoadedPlugin[] {
  return loadedPlugins;
}

export function detectLanguage(filePath: string): LanguagePlugin | null {
  const ext = extname(filePath);
  const base = basename(filePath);

  for (const { plugin } of loadedPlugins) {
    for (const pattern of plugin.extensions) {
      if (pattern === ext || pattern === base) {
        return plugin;
      }
    }
  }
  return null;
}
