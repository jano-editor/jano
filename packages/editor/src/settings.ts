import {
  loadConfig,
  saveConfig,
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
  type JanoConfig,
} from "./plugins/config.ts";

let cachedConfig: JanoConfig | null = null;

function getConfig(): JanoConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function getEditorSettings(): EditorSettings {
  return getConfig().editor;
}

export function updateEditorSetting<K extends keyof EditorSettings>(
  key: K,
  value: EditorSettings[K],
): void {
  const cfg = getConfig();
  cfg.editor[key] = value;
  saveConfig(cfg);
}

export function resetEditorSettings(): void {
  const cfg = getConfig();
  cfg.editor = { ...DEFAULT_EDITOR_SETTINGS };
  saveConfig(cfg);
}
