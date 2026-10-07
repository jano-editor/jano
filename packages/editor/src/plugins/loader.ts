import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { LanguagePlugin } from "./types.ts";
import {
  validateManifest,
  manifestProblems,
  CURRENT_API_VERSION,
  MIN_API_VERSION,
} from "./manifest.ts";
import type { PluginManifest } from "./manifest.ts";
import { getPluginsDir, loadConfig, isPluginEnabled } from "./config.ts";

// make require() available globally for plugins that bundle CJS dependencies
const globalAny = globalThis as any;
if (!globalAny.require) {
  globalAny.require = createRequire(import.meta.url);
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  plugin: LanguagePlugin;
  dir: string;
}

/** A plugin that could not be loaded, explained for humans (why / fix / link). */
export interface PluginError {
  dir: string;
  /** plugin name, or the folder name if plugin.json couldn't be read */
  name: string;
  /** one line summary */
  error: string;
  why: string;
  fix: string;
  link: string;
}

const DOCS_LINK = "https://janoeditor.dev/docs";

function reinstallFix(name: string): string {
  return `Reinstall it with 'jano plugin install ${name}', or remove it with 'jano plugin remove ${name}'.`;
}

/** Explains why importing a plugin's entry file failed, with the common bundling mistakes. */
export function explainImportError(name: string, err: unknown): Omit<PluginError, "dir" | "name"> {
  const message = err instanceof Error ? err.message : String(err);
  const error = `${name} failed to load`;

  const dynamicRequire = /Dynamic require of "([^"]+)" is not supported/.exec(message);
  if (dynamicRequire || /require is not defined/.test(message)) {
    const mod = dynamicRequire?.[1];
    return {
      error,
      why: `The plugin's bundle calls require(${mod ? `"${mod}"` : ""}), which doesn't exist in ES modules.`,
      fix: mod
        ? `Plugin author: rebuild with esbuild --platform=node, or mark "${mod}" as external.`
        : "Plugin author: rebuild with esbuild --platform=node --format=esm.",
      link: DOCS_LINK,
    };
  }

  const missingModule = /Cannot find (?:module|package) '([^']+)'/.exec(message);
  if (missingModule) {
    return {
      error,
      why: `The plugin imports "${missingModule[1]}", which isn't bundled with it.`,
      fix: "Plugin author: bundle all dependencies into the entry file.",
      link: DOCS_LINK,
    };
  }

  // node throws a SyntaxError, bun (and the compiled binary) a BuildMessage
  if (err instanceof SyntaxError || (err instanceof Error && err.name === "BuildMessage")) {
    return {
      error,
      why: `The plugin's code has a syntax error: ${message}`,
      fix: `Update the plugin, or report it to its author. ${reinstallFix(name)}`,
      link: DOCS_LINK,
    };
  }

  return { error, why: message, fix: reinstallFix(name), link: DOCS_LINK };
}

export interface LoadResult {
  plugins: LoadedPlugin[];
  errors: PluginError[];
  conflicts: string[];
}

export async function loadPlugins(): Promise<LoadResult> {
  const pluginsDir = getPluginsDir();
  const config = loadConfig();
  const result: LoadResult = { plugins: [], errors: [], conflicts: [] };

  if (!existsSync(pluginsDir)) return result;

  let dirs: string[];
  try {
    dirs = readdirSync(pluginsDir, { withFileTypes: true })
      // dot dirs are install staging areas, not plugins
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return result;
  }

  // track which extensions are claimed
  const extensionMap = new Map<string, string>();

  for (const dirName of dirs) {
    const dir = join(pluginsDir, dirName);
    const manifestPath = join(dir, "plugin.json");

    // check manifest exists
    const folder = basename(dir);
    const fail = (name: string, e: Omit<PluginError, "dir" | "name">) =>
      result.errors.push({ dir, name, ...e });

    if (!existsSync(manifestPath)) {
      fail(folder, {
        error: `${folder} has no plugin.json`,
        why: "Every plugin folder needs a plugin.json that describes it.",
        fix: reinstallFix(folder),
        link: DOCS_LINK,
      });
      continue;
    }

    // parse manifest
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      fail(folder, {
        error: `${folder} has a broken plugin.json`,
        why: `plugin.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        fix: reinstallFix(folder),
        link: DOCS_LINK,
      });
      continue;
    }

    const manifest: PluginManifest | null = validateManifest(data);
    if (!manifest) {
      fail(folder, {
        error: `${folder} has an incomplete plugin.json`,
        why: manifestProblems(data).join(", "),
        fix: reinstallFix(folder),
        link: DOCS_LINK,
      });
      continue;
    }

    // check API compatibility
    if (manifest.api > CURRENT_API_VERSION) {
      fail(manifest.name, {
        error: `${manifest.name} needs a newer jano`,
        why: `It uses plugin API v${manifest.api}, this jano supports up to v${CURRENT_API_VERSION}.`,
        fix: "Run 'jano update'.",
        link: DOCS_LINK,
      });
      continue;
    }

    if (manifest.api < MIN_API_VERSION) {
      fail(manifest.name, {
        error: `${manifest.name} is too old for this jano`,
        why: `It uses plugin API v${manifest.api}, jano needs at least v${MIN_API_VERSION}.`,
        fix: `Update it with 'jano plugin install ${manifest.name}'.`,
        link: DOCS_LINK,
      });
      continue;
    }

    // check if enabled
    if (!isPluginEnabled(config, manifest.name)) continue;

    // check extension conflicts
    let hasConflict = false;
    for (const ext of manifest.extensions) {
      const existing = extensionMap.get(ext);
      if (existing) {
        result.conflicts.push(
          `Extension "${ext}" claimed by both "${existing}" and "${manifest.name}". Skipping "${manifest.name}".`,
        );
        hasConflict = true;
        break;
      }
    }
    if (hasConflict) continue;

    // load the plugin
    const entryPath = join(dir, manifest.entry);
    if (!existsSync(entryPath)) {
      fail(manifest.name, {
        error: `${manifest.name} is missing its code`,
        why: `plugin.json points to "${manifest.entry}", but that file doesn't exist.`,
        fix: reinstallFix(manifest.name),
        link: DOCS_LINK,
      });
      continue;
    }

    try {
      const entryUrl = pathToFileURL(entryPath).href;
      const mod = await import(entryUrl);
      const plugin: LanguagePlugin = mod.default?.default ?? mod.default ?? mod.plugin ?? mod;

      if (!plugin.name || !plugin.extensions) {
        fail(manifest.name, {
          error: `${manifest.name} doesn't export a plugin`,
          why: "The entry file has no default export with a name and extensions.",
          fix: "Plugin author: export default a LanguagePlugin object.",
          link: DOCS_LINK,
        });
        continue;
      }

      // claim extensions
      for (const ext of manifest.extensions) {
        extensionMap.set(ext, manifest.name);
      }

      result.plugins.push({ manifest, plugin, dir });
    } catch (err) {
      fail(manifest.name, explainImportError(manifest.name, err));
    }
  }

  return result;
}
