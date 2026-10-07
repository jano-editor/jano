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

// values from .editorconfig for the open file, they win over the user's settings
let fileOverrides: Partial<EditorSettings> = {};

/** Settings in effect for the open file: the user's settings plus .editorconfig overrides. */
export function getEditorSettings(): EditorSettings {
  return { ...getConfig().editor, ...fileOverrides };
}

/** Called whenever the open file changes (open, Save As, restore). */
export function setFileOverrides(overrides: Partial<EditorSettings>): void {
  fileOverrides = overrides;
}

/** Which settings currently come from .editorconfig, for the settings dialog. */
export function getFileOverrides(): Readonly<Partial<EditorSettings>> {
  return fileOverrides;
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
