#!/usr/bin/env node
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
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

async function handleUpdate() {
  console.log(`[jano] Current version: v${VERSION}`);
  console.log("[jano] Checking for updates...");
  try {
    const { execSync } = await import("node:child_process");
    const latest = execSync("npm view @jano-editor/editor version", { encoding: "utf8" }).trim();
    if (latest === VERSION) {
      console.log(`[jano] Already up to date (v${VERSION}).`);
    } else {
      console.log(`[jano] Update available: v${VERSION} → v${latest}`);
      console.log("[jano] Updating...");
      execSync("npm install -g @jano-editor/editor@latest", { stdio: "inherit" });
      console.log(`[jano] ✓ Updated to v${latest}`);
    }
  } catch (err) {
    console.error(`[jano] Update failed: ${String(err)}`);
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
  void import("./index.ts");
}
