// TODO: connect to actual plugin registry server
const REGISTRY_URL = "https://plugins.jano.dev";

export interface RegistryPlugin {
  name: string;
  version: string;
  description: string;
  downloadUrl: string;
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
}

export async function installPlugin(_name: string): Promise<{ success: boolean; error?: string }> {
  // TODO: implement when registry server is available
  // 1. fetch plugin info from REGISTRY_URL/plugins/<name>
  // 2. download tarball from downloadUrl
  // 3. extract to ~/.jano/plugins/<name>/
  // 4. validate plugin.json
  // 5. enable in config
  return { success: false, error: `Plugin registry not available yet (${REGISTRY_URL})` };
}

export async function checkUpdates(
  _installedPlugins: { name: string; version: string }[],
): Promise<UpdateInfo[]> {
  // TODO: implement when registry server is available
  // 1. POST to REGISTRY_URL/updates with list of installed plugins
  // 2. return list of available updates
  return [];
}

export async function searchPlugins(_query: string): Promise<RegistryPlugin[]> {
  // TODO: implement when registry server is available
  // 1. GET REGISTRY_URL/search?q=<query>
  // 2. return matching plugins
  return [];
}
