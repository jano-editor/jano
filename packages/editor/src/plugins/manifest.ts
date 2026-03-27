// bump this when the plugin API has breaking changes
export const CURRENT_API_VERSION = 1;

export interface PluginManifest {
  name: string;
  version: string;
  api: number;
  description: string;
  extensions: string[];
  entry: string;
  author?: string;
  homepage?: string;
  license?: string;
}

export function validateManifest(data: unknown): PluginManifest | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name) return null;
  if (typeof obj.version !== "string" || !obj.version) return null;
  if (typeof obj.description !== "string") return null;
  if (!Array.isArray(obj.extensions) || obj.extensions.length === 0) return null;
  if (!obj.extensions.every((e: unknown) => typeof e === "string")) return null;
  if (typeof obj.entry !== "string" || !obj.entry) return null;

  const api = typeof obj.api === "number" ? obj.api : 1;

  return {
    name: obj.name,
    version: obj.version,
    api,
    description: obj.description as string,
    extensions: obj.extensions as string[],
    entry: obj.entry,
    author: typeof obj.author === "string" ? obj.author : undefined,
    homepage: typeof obj.homepage === "string" ? obj.homepage : undefined,
    license: typeof obj.license === "string" ? obj.license : undefined,
  };
}
