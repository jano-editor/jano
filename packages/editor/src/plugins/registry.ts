import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import AdmZip from "adm-zip";
import { getPluginDir, getPluginsDir } from "./config.ts";
import { validateManifest, MIN_API_VERSION, CURRENT_API_VERSION } from "./manifest.ts";
import { compareVersions } from "../utils/version-check.ts";

const REGISTRY_URL = "https://janoeditor.dev/api";
const API_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

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

/** fetch with a timeout and a readable message when the registry can't be reached */
async function registryFetch(url: string, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new Error(
      timedOut
        ? "The plugin registry (janoeditor.dev) did not respond in time. Try again later."
        : "Could not reach the plugin registry (janoeditor.dev). Check your internet connection.",
      { cause: err },
    );
  }
}

export async function fetchPluginList(): Promise<RegistryPlugin[]> {
  const res = await registryFetch(`${REGISTRY_URL}/plugins`);
  if (!res.ok) throw new Error(`Failed to fetch plugin list: ${res.statusText}`);
  return res.json();
}

export async function fetchPluginDetail(name: string): Promise<RegistryPluginDetail> {
  const res = await registryFetch(`${REGISTRY_URL}/plugins/${name}`);
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

  const res = await registryFetch(url, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`Plugin '${name}'${version ? ` v${version}` : ""} not found.`);
    throw new Error(`Download failed: ${res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extracts a plugin zip into a fresh staging dir and checks it is a loadable plugin.
 * Throws with a readable message otherwise. The caller owns the returned dir.
 */
export function stagePlugin(zipBuffer: Buffer, name: string): string {
  const pluginsDir = getPluginsDir();
  mkdirSync(pluginsDir, { recursive: true });
  // same filesystem as the final location, so the swap below is a plain rename.
  // the dot keeps the loader from treating it as a plugin.
  const staging = mkdtempSync(join(pluginsDir, `.${name}-install-`));
  try {
    const zip = new AdmZip(zipBuffer);
    const root = resolve(staging) + sep;
    for (const entry of zip.getEntries()) {
      // zip slip: no entry may write outside the staging dir
      if (!resolve(staging, entry.entryName).startsWith(root)) {
        throw new Error(`Archive contains an unsafe path: ${entry.entryName}`);
      }
    }
    zip.extractAllTo(staging, true);

    const manifestPath = join(staging, "plugin.json");
    if (!existsSync(manifestPath)) throw new Error("Archive has no plugin.json");
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!manifest) throw new Error("plugin.json is missing required fields");
    // otherwise it would sit in plugins/<name> but load as something else
    if (manifest.name !== name) {
      throw new Error(`Archive contains plugin '${manifest.name}', expected '${name}'`);
    }
    if (manifest.api > CURRENT_API_VERSION) {
      throw new Error(
        `${name} needs plugin API v${manifest.api}, this jano supports v${CURRENT_API_VERSION}. Run 'jano update' first.`,
      );
    }
    if (manifest.api < MIN_API_VERSION) {
      throw new Error(`${name} uses plugin API v${manifest.api}, which is no longer supported.`);
    }
    if (!existsSync(join(staging, manifest.entry))) {
      throw new Error(`Entry file '${manifest.entry}' is missing in the archive`);
    }
    return staging;
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

/** Replaces the installed plugin with the staged one. Restores the old version if that fails. */
function swapIn(staging: string, pluginDir: string) {
  const backup = existsSync(pluginDir) ? `${staging}-previous` : null;
  if (backup) renameSync(pluginDir, backup);
  try {
    renameSync(staging, pluginDir);
  } catch (err) {
    if (backup) renameSync(backup, pluginDir);
    throw err;
  }
  if (backup) rmSync(backup, { recursive: true, force: true });
}

/**
 * Installs a plugin from the registry. Progress goes to `report`, which prints to the
 * console by default. Inside the editor pass a callback instead, console output would
 * break the screen.
 */
export async function installPlugin(
  nameWithVersion: string,
  report: (message: string) => void = (message) => console.log(`[jano] ${message}`),
): Promise<{ success: boolean; name: string; version: string; error?: string }> {
  const [name, requestedVersion] = nameWithVersion.split("@") as [string, string | undefined];

  try {
    // the name ends up in the download url and the install path, reject anything path-like early
    const pluginDir = getPluginDir(name);

    // fetch plugin info
    report(`Fetching plugin info for '${name}'...`);
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
    let installedVersion: string | null = null;
    try {
      installedVersion = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8")).version;
    } catch {
      // not installed
    }

    if (installedVersion) {
      if (installedVersion === version) {
        return { success: true, name, version, error: `Already installed at v${version}.` };
      }
      const direction = compareVersions(installedVersion, version) < 0 ? "upgrade" : "downgrade";
      report(`${name}: ${direction} from v${installedVersion} to v${version}`);
    }

    report(`Downloading ${name} v${version}...`);
    const zipBuffer = await downloadPlugin(name, requestedVersion);

    report(`Installing to ${pluginDir}...`);
    swapIn(stagePlugin(zipBuffer, name), pluginDir);

    report(`✓ Installed ${name} v${version}`);
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
