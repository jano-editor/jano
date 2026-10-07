import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { homedir, platform } from "node:os";

export interface EditorSettings {
  tabSize: number;
  insertSpaces: boolean;
  lineNumbers: boolean;
  autoComplete: boolean;
  startupAnimation: boolean;
  /** offer recommended plugins on startup while some are missing */
  pluginRecommendations: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  tabSize: 2,
  insertSpaces: true,
  lineNumbers: true,
  autoComplete: true,
  startupAnimation: true,
  pluginRecommendations: true,
};

export interface JanoConfig {
  plugins: Record<string, { enabled: boolean }>;
  editor: EditorSettings;
}

export interface JanoPaths {
  config: string;
  data: string;
  plugins: string;
  cache: string;
  backups: string;
}

function resolvePaths(): JanoPaths {
  // override all paths with a single env var
  if (process.env.JANO_HOME) {
    const base = process.env.JANO_HOME;
    return {
      config: base,
      data: base,
      plugins: join(base, "plugins"),
      cache: join(base, "cache"),
      backups: join(base, "backups"),
    };
  }

  // prefer real user home — even when running under sudo
  const sudoUser = process.env.SUDO_USER;
  const home = sudoUser
    ? join("/home", sudoUser)
    : process.env.SNAP_REAL_HOME || process.env.HOME || process.env.USERPROFILE || homedir();
  const os = platform();

  if (os === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    const config = join(appData, "jano");
    const data = join(localAppData, "jano");
    return {
      config,
      data,
      plugins: join(data, "plugins"),
      cache: join(localAppData, "jano", "cache"),
      backups: join(data, "backups"),
    };
  }

  if (os === "darwin") {
    const appSupport = join(home, "Library", "Application Support", "jano");
    return {
      config: appSupport,
      data: appSupport,
      plugins: join(appSupport, "plugins"),
      cache: join(home, "Library", "Caches", "jano"),
      backups: join(appSupport, "backups"),
    };
  }

  // linux + other unix — ignore XDG vars if they point inside a snap sandbox
  const isSnapped = (v: string | undefined) => v && v.includes("/snap/");
  const configDir =
    (!isSnapped(process.env.XDG_CONFIG_HOME) && process.env.XDG_CONFIG_HOME) ||
    join(home, ".config");
  const dataDir =
    (!isSnapped(process.env.XDG_DATA_HOME) && process.env.XDG_DATA_HOME) ||
    join(home, ".local", "share");
  const cacheDir =
    (!isSnapped(process.env.XDG_CACHE_HOME) && process.env.XDG_CACHE_HOME) || join(home, ".cache");
  const stateDir =
    (!isSnapped(process.env.XDG_STATE_HOME) && process.env.XDG_STATE_HOME) ||
    join(home, ".local", "state");

  return {
    config: join(configDir, "jano"),
    data: join(dataDir, "jano"),
    plugins: join(dataDir, "jano", "plugins"),
    cache: join(cacheDir, "jano"),
    backups: join(stateDir, "jano", "backups"),
  };
}

const paths = resolvePaths();

export function getPaths(): JanoPaths {
  return paths;
}
export function getConfigDir(): string {
  return paths.config;
}
export function getPluginsDir(): string {
  return paths.plugins;
}

// letters, digits, ".", "_" and "-", not starting with a dot, so no "..", "/" or hidden dirs
const PLUGIN_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function isValidPluginName(name: string): boolean {
  return PLUGIN_NAME.test(name);
}

/** Directory of a plugin. Throws for names that could escape the plugins dir (e.g. "../.."). */
export function getPluginDir(name: string): string {
  if (!isValidPluginName(name)) throw new Error(`Invalid plugin name '${name}'.`);
  const dir = resolve(paths.plugins, name);
  // defense in depth, the name check above should already make this impossible
  if (!dir.startsWith(resolve(paths.plugins) + sep)) {
    throw new Error(`Invalid plugin name '${name}'.`);
  }
  return dir;
}
export function getCacheDir(): string {
  return paths.cache;
}
export function getBackupsDir(): string {
  return paths.backups;
}
export function getConfigPath(): string {
  return join(paths.config, "config.json");
}

export function ensureDirs() {
  for (const dir of [paths.config, paths.data, paths.plugins, paths.cache]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): JanoConfig {
  ensureDirs();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { plugins: {}, editor: { ...DEFAULT_EDITOR_SETTINGS } };
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<JanoConfig>;
    return {
      plugins: parsed.plugins ?? {},
      editor: { ...DEFAULT_EDITOR_SETTINGS, ...parsed.editor },
    };
  } catch {
    return { plugins: {}, editor: { ...DEFAULT_EDITOR_SETTINGS } };
  }
}

export function saveConfig(config: JanoConfig) {
  ensureDirs();
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

export function isPluginEnabled(config: JanoConfig, name: string): boolean {
  return config.plugins[name]?.enabled !== false;
}

export function setPluginEnabled(config: JanoConfig, name: string, enabled: boolean) {
  config.plugins[name] = { enabled };
}
