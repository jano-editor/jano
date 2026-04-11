import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

export interface EditorSettings {
  tabSize: number;
  insertSpaces: boolean;
  lineNumbers: boolean;
  autoComplete: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  tabSize: 2,
  insertSpaces: true,
  lineNumbers: true,
  autoComplete: true,
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
    };
  }

  if (os === "darwin") {
    const appSupport = join(home, "Library", "Application Support", "jano");
    return {
      config: appSupport,
      data: appSupport,
      plugins: join(appSupport, "plugins"),
      cache: join(home, "Library", "Caches", "jano"),
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

  return {
    config: join(configDir, "jano"),
    data: join(dataDir, "jano"),
    plugins: join(dataDir, "jano", "plugins"),
    cache: join(cacheDir, "jano"),
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
export function getCacheDir(): string {
  return paths.cache;
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
