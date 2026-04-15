#!/usr/bin/env node
import {
  readdirSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { platform, arch } from "node:os";
import { getPluginsDir } from "./plugins/config.ts";
import { installPlugin, searchPlugins, fetchPluginList } from "./plugins/registry.ts";

const args = process.argv.slice(2);

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

export const CLI_COMMANDS = [
  "  jano <file>           Open file",
  "  jano                  New file",
  "  jano --version        Show version",
  "  jano plugin list      Installed plugins",
  "  jano plugin search    Browse plugin store",
  "  jano plugin install   Install plugin",
  "  jano plugin remove    Remove plugin",
  "  jano update           Update jano",
];

// --version flag
if (args.includes("--version") || args.includes("-v")) {
  console.log(`jano v${VERSION}`);
  process.exit(0);
}

// --help flag
if (args.includes("--help") || args.includes("-h")) {
  console.log(`jano v${VERSION} - Terminal editor

Usage: jano [options] [file]

Options:
  -v, --version        Show version
  --debug              Enable debug mode
  -h, --help           Show this help

Commands:
${CLI_COMMANDS.join("\n")}`);
  process.exit(0);
}

// --debug flag
if (args.includes("--debug")) {
  process.env.JANO_DEBUG = "1";
  args.splice(args.indexOf("--debug"), 1);
}

async function handlePluginCommand() {
  const subcommand = args[1];

  switch (subcommand) {
    case "install": {
      const target = args[2];
      if (!target) {
        console.error("Usage: jano plugin install <name[@version]>");
        process.exit(1);
      }
      const result = await installPlugin(target);
      if (result.success) {
        if (result.error) {
          console.log(`[jano] ${result.error}`);
        } else {
          console.log(`[jano] ✓ ${result.name} v${result.version} installed.`);
        }
      } else {
        console.error(`[jano] ✗ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "list": {
      const pluginsDir = getPluginsDir();
      if (!existsSync(pluginsDir)) {
        console.log("No plugins installed.");
        break;
      }
      const dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      if (dirs.length === 0) {
        console.log("No plugins installed.");
        break;
      }
      console.log("Installed plugins:\n");
      for (const dir of dirs) {
        const manifestPath = join(pluginsDir, dir.name, "plugin.json");
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
          console.log(
            `  ${manifest.name} v${manifest.version}  (${manifest.extensions.join(", ")})`,
          );
        } catch {
          console.log(`  ${dir.name} (invalid plugin.json)`);
        }
      }
      break;
    }

    case "remove": {
      const name = args[2];
      if (!name) {
        console.error("Usage: jano plugin remove <name>");
        process.exit(1);
      }
      const pluginDir = join(getPluginsDir(), name);
      if (!existsSync(pluginDir)) {
        console.error(`[jano] Plugin '${name}' is not installed.`);
        process.exit(1);
      }
      rmSync(pluginDir, { recursive: true });
      console.log(`[jano] ✓ Removed ${name}.`);
      break;
    }

    case "search": {
      const query = args[2];
      if (!query) {
        // list all
        const all = await fetchPluginList();
        if (all.length === 0) {
          console.log("No plugins available.");
          break;
        }
        console.log("Available plugins:\n");
        for (const p of all) {
          console.log(`  ${p.name} v${p.latestVersion}  ${p.description}`);
        }
      } else {
        const results = await searchPlugins(query);
        if (results.length === 0) {
          console.log(`No plugins found for '${query}'.`);
          break;
        }
        console.log(`Found ${results.length} plugin(s):\n`);
        for (const p of results) {
          console.log(`  ${p.name} v${p.latestVersion}  ${p.description}`);
        }
      }
      break;
    }

    default:
      console.error("Usage: jano plugin <install|list|remove|search> [args]");
      process.exit(1);
  }
}

type InstallMethod = "npm" | "brew" | "standalone" | "dev";

function detectInstallMethod(): InstallMethod {
  const execPath = process.execPath;
  const isBun = !!process.versions.bun;

  // not bun → must be running under node → installed via npm
  if (!isBun) return "npm";

  // bun: either compiled binary or running script via `bun script.ts` (dev)
  const basename = execPath.split(/[\\/]/).pop() ?? "";
  if (basename === "bun" || basename === "bun.exe") return "dev";

  // compiled bun binary
  if (
    execPath.includes("/homebrew/") ||
    execPath.includes("/linuxbrew/") ||
    execPath.includes("/Cellar/")
  ) {
    return "brew";
  }

  return "standalone";
}

async function fetchLatestEditorVersion(): Promise<string> {
  const res = await fetch("https://api.github.com/repos/jano-editor/jano/releases?per_page=20", {
    headers: { "User-Agent": "jano-update-check" },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const releases = (await res.json()) as { tag_name: string }[];
  const editor = releases.find((r) => r.tag_name.startsWith("editor-v"));
  if (!editor) throw new Error("No editor release found on GitHub");
  return editor.tag_name.replace(/^editor-v/, "");
}

function getBinaryAssetName(): string | null {
  const os = platform();
  const cpu = arch();
  if (os === "linux" && cpu === "x64") return "jano-linux-x64";
  if (os === "darwin" && cpu === "arm64") return "jano-darwin-arm64";
  if (os === "win32" && cpu === "x64") return "jano-windows-x64.exe";
  return null;
}

async function selfUpdateBinary(latestVersion: string): Promise<void> {
  const assetName = getBinaryAssetName();
  if (!assetName) {
    throw new Error(`Unsupported platform: ${platform()}/${arch()}`);
  }
  if (platform() === "win32") {
    throw new Error(
      "Automatic self-update is not supported on Windows yet.\n" +
        "Please re-download the latest version from https://janoeditor.dev",
    );
  }

  const url = `https://github.com/jano-editor/jano/releases/download/editor-v${latestVersion}/${assetName}`;
  console.log(`[jano] Downloading ${assetName}...`);

  const res = await fetch(url, { headers: { "User-Agent": "jano-update" } });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tmpFile = `${process.execPath}.new`;
  writeFileSync(tmpFile, buf);
  chmodSync(tmpFile, 0o755);
  // atomic replace — works on linux/macOS even for the running binary
  renameSync(tmpFile, process.execPath);

  console.log(`[jano] ✓ Binary replaced. Restart jano to use v${latestVersion}.`);
}

async function handleUpdate() {
  console.log(`[jano] Current version: v${VERSION}`);

  const method = detectInstallMethod();
  console.log(`[jano] Install method:  ${method}`);

  if (method === "dev") {
    console.error("[jano] Running in dev mode (bun script.ts) — update not supported.");
    process.exit(1);
  }

  console.log("[jano] Checking for updates...");
  let latest: string;
  try {
    latest = await fetchLatestEditorVersion();
  } catch (err) {
    console.error(
      `[jano] Could not check for updates: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (latest === VERSION) {
    console.log(`[jano] Already up to date (v${VERSION}).`);
    return;
  }

  console.log(`[jano] Update available: v${VERSION} → v${latest}`);

  try {
    if (method === "npm") {
      const { execSync } = await import("node:child_process");
      console.log("[jano] Running: npm install -g @jano-editor/editor@latest");
      execSync("npm install -g @jano-editor/editor@latest", { stdio: "inherit" });
      console.log(`[jano] ✓ Updated to v${latest}`);
    } else if (method === "brew") {
      const { execSync } = await import("node:child_process");
      console.log("[jano] Running: brew upgrade jano-editor/jano/jano");
      execSync("brew upgrade jano-editor/jano/jano", { stdio: "inherit" });
      console.log(`[jano] ✓ Updated to v${latest}`);
    } else {
      await selfUpdateBinary(latest);
    }
  } catch (err) {
    console.error(`[jano] Update failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// route commands
process.env.JANO_VERSION = VERSION;
if (args[0] === "plugin") {
  void handlePluginCommand();
} else if (args[0] === "update") {
  void handleUpdate();
} else {
  // pass the file path to the editor via env var so index.ts doesn't have to
  // re-parse process.argv (and accidentally pick up flags like --debug)
  if (args[0]) process.env.JANO_FILE = args[0];
  void import("./index.ts");
}
