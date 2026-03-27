import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

function getPluginsDir() {
  if (process.env.JANO_HOME) {
    return join(process.env.JANO_HOME, "plugins");
  }
  const home =
    process.env.JANO_HOME ||
    process.env.SNAP_REAL_HOME ||
    process.env.HOME ||
    process.env.USERPROFILE ||
    homedir();
  const os = platform();
  if (os === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return join(localAppData, "jano", "plugins");
  }
  if (os === "darwin") {
    return join(home, "Library", "Application Support", "jano", "plugins");
  }
  const xdg = process.env.XDG_DATA_HOME;
  const dataDir = xdg && !xdg.includes("/snap/") ? xdg : join(home, ".local", "share");
  return join(dataDir, "jano", "plugins");
}

const pluginDir = join(getPluginsDir(), "jano-plugin-yaml");
const srcDir = new URL("..", import.meta.url).pathname;

mkdirSync(pluginDir, { recursive: true });
cpSync(join(srcDir, "dist", "index.js"), join(pluginDir, "index.js"));
cpSync(join(srcDir, "plugin.json"), join(pluginDir, "plugin.json"));

console.log(`Installed jano-plugin-yaml to ${pluginDir}`);
