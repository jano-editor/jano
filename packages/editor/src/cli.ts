#!/usr/bin/env node
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getPluginsDir } from "./plugins/config.ts";
import { installPlugin, searchPlugins, fetchPluginList } from "./plugins/registry.ts";

const args = process.argv.slice(2);

// read version from package.json
const VERSION = (() => {
  try {
    const { readFileSync } = require("node:fs");
    const { join, dirname } = require("node:path");
    const pkg = JSON.parse(readFileSync(join(dirname(__filename), "..", "package.json"), "utf8"));
    return pkg.version || "dev";
  } catch {
    return "dev";
  }
})();

// --version flag
if (args.includes("--version") || args.includes("-v")) {
  console.log(`jano v${VERSION}`);
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

// route: "jano plugin ..." or "jano <file>"
process.env.JANO_VERSION = VERSION;
if (args[0] === "plugin") {
  void handlePluginCommand();
} else {
  // normal editor mode — dynamic import to avoid loading editor code for CLI commands
  void import("./index.ts");
}
