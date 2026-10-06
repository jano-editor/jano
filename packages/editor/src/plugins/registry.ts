import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { getPluginDir } from "./config.ts";

const REGISTRY_URL = "https://janoeditor.dev/api";

export interface RegistryPlugin {
  name: string;
  latestVersion: string;
  description: string;
  extensions: string[];
  author: string;
  totalDownloads: number;
}

export interface RegistryPluginDetail extends RegistryPlugin {
  versions: { version: string; downloads: number; createdAt: string }[];
  readme: string | null;
  repoUrl: string;
  license: string | null;
}

export async function fetchPluginList(): Promise<RegistryPlugin[]> {
  const res = await fetch(`${REGISTRY_URL}/plugins`);
  if (!res.ok) throw new Error(`Failed to fetch plugin list: ${res.statusText}`);
  return res.json();
}

export async function fetchPluginDetail(name: string): Promise<RegistryPluginDetail> {
  const res = await fetch(`${REGISTRY_URL}/plugins/${name}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Plugin '${name}' not found.`);
    throw new Error(`Failed to fetch plugin: ${res.statusText}`);
  }
  return res.json();
}

export async function downloadPlugin(name: string, version?: string): Promise<Buffer> {
  const url = version
    ? `${REGISTRY_URL}/plugins/${name}/download?version=${version}`
    : `${REGISTRY_URL}/plugins/${name}/download`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`Plugin '${name}'${version ? ` v${version}` : ""} not found.`);
    throw new Error(`Download failed: ${res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function installPlugin(
  nameWithVersion: string,
): Promise<{ success: boolean; name: string; version: string; error?: string }> {
  // parse name@version
  let name: string;
  let requestedVersion: string | undefined;

  if (nameWithVersion.includes("@")) {
    const parts = nameWithVersion.split("@");
    name = parts[0];
    requestedVersion = parts[1];
  } else {
    name = nameWithVersion;
  }

  try {
    // the name ends up in the download url and the install path, reject anything path-like early
    getPluginDir(name);

    // fetch plugin info
    console.log(`[jano] Fetching plugin info for '${name}'...`);
    const detail = await fetchPluginDetail(name);

    const version = requestedVersion || detail.latestVersion;

    // check if requested version exists
    if (requestedVersion) {
      const versionExists = detail.versions.some((v) => v.version === requestedVersion);
      if (!versionExists) {
        const available = detail.versions.map((v) => v.version).join(", ");
        return {
          success: false,
          name,
          version,
          error: `Version ${requestedVersion} not found. Available: ${available}`,
        };
      }
    }

    // check if already installed
    const pluginDir = getPluginDir(name);
    const manifestPath = join(pluginDir, "plugin.json");

    let installedVersion: string | null = null;
    try {
      const { readFileSync } = await import("node:fs");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      installedVersion = manifest.version;
    } catch {
      // not installed
    }

    if (installedVersion) {
      if (installedVersion === version) {
        return { success: true, name, version, error: `Already installed at v${version}.` };
      }
      const direction = installedVersion < version ? "upgrade" : "downgrade";
      console.log(`[jano] ${name}: ${direction} from v${installedVersion} to v${version}`);
    }

    // download
    console.log(`[jano] Downloading ${name} v${version}...`);
    const zipBuffer = await downloadPlugin(name, requestedVersion);

    // extract zip
    console.log(`[jano] Installing to ${pluginDir}...`);
    mkdirSync(pluginDir, { recursive: true });
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(pluginDir, true);

    console.log(`[jano] ✓ Installed ${name} v${version}`);
    return { success: true, name, version };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, name, version: requestedVersion || "unknown", error: msg };
  }
}

export async function searchPlugins(query: string): Promise<RegistryPlugin[]> {
  const all = await fetchPluginList();
  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.extensions.some((e) => e.toLowerCase().includes(q)),
  );
}
