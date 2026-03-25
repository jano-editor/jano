import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LanguagePlugin } from './types.ts';
import { validateManifest, CURRENT_API_VERSION } from './manifest.ts';
import type { PluginManifest } from './manifest.ts';
import { getPluginsDir, loadConfig, isPluginEnabled } from './config.ts';

export interface LoadedPlugin {
  manifest: PluginManifest;
  plugin: LanguagePlugin;
  dir: string;
}

export interface PluginError {
  dir: string;
  error: string;
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
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return result;
  }

  // track which extensions are claimed
  const extensionMap = new Map<string, string>();

  for (const dirName of dirs) {
    const dir = join(pluginsDir, dirName);
    const manifestPath = join(dir, 'plugin.json');

    // check manifest exists
    if (!existsSync(manifestPath)) {
      result.errors.push({ dir, error: 'Missing plugin.json' });
      continue;
    }

    // parse manifest
    let manifest: PluginManifest | null;
    try {
      const raw = readFileSync(manifestPath, 'utf8');
      manifest = validateManifest(JSON.parse(raw));
    } catch (err) {
      result.errors.push({ dir, error: `Invalid plugin.json: ${err}` });
      continue;
    }

    if (!manifest) {
      result.errors.push({ dir, error: 'plugin.json missing required fields' });
      continue;
    }

    // check API compatibility
    if (manifest.api > CURRENT_API_VERSION) {
      result.errors.push({ dir, error: `"${manifest.name}" requires API v${manifest.api}, but jano supports v${CURRENT_API_VERSION}. Update jano to use this plugin.` });
      continue;
    }

    // check if enabled
    if (!isPluginEnabled(config, manifest.name)) continue;

    // check extension conflicts
    let hasConflict = false;
    for (const ext of manifest.extensions) {
      const existing = extensionMap.get(ext);
      if (existing) {
        result.conflicts.push(`Extension "${ext}" claimed by both "${existing}" and "${manifest.name}". Skipping "${manifest.name}".`);
        hasConflict = true;
        break;
      }
    }
    if (hasConflict) continue;

    // load the plugin
    const entryPath = join(dir, manifest.entry);
    if (!existsSync(entryPath)) {
      result.errors.push({ dir, error: `Entry file not found: ${manifest.entry}` });
      continue;
    }

    try {
      const entryUrl = pathToFileURL(entryPath).href;
      const mod = await import(entryUrl);
      const plugin: LanguagePlugin = mod.default?.default ?? mod.default ?? mod.plugin ?? mod;

      if (!plugin.name || !plugin.extensions) {
        result.errors.push({ dir, error: 'Plugin does not export a valid LanguagePlugin' });
        continue;
      }

      // claim extensions
      for (const ext of manifest.extensions) {
        extensionMap.set(ext, manifest.name);
      }

      result.plugins.push({ manifest, plugin, dir });
    } catch (err) {
      result.errors.push({ dir, error: `Failed to load: ${err}` });
    }
  }

  return result;
}
