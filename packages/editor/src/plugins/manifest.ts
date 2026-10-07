// newest plugin API this jano understands. plugins declaring a higher one need a newer jano.
export const CURRENT_API_VERSION = 1;
// oldest plugin API still supported. raise it when a breaking change drops old plugins.
export const MIN_API_VERSION = 1;

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

/** Human readable list of what is wrong with a plugin.json, empty if it is valid. */
export function manifestProblems(data: unknown): string[] {
  if (!data || typeof data !== "object") return ["plugin.json is not a JSON object"];
  const obj = data as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof obj.name !== "string" || !obj.name) problems.push('"name" is missing');
  if (typeof obj.version !== "string" || !obj.version) problems.push('"version" is missing');
  if (typeof obj.description !== "string") problems.push('"description" is missing');
  if (
    !Array.isArray(obj.extensions) ||
    obj.extensions.length === 0 ||
    !obj.extensions.every((e: unknown) => typeof e === "string")
  ) {
    problems.push('"extensions" must be a non-empty list of strings');
  }
  if (typeof obj.entry !== "string" || !obj.entry) problems.push('"entry" is missing');
  return problems;
}

export function validateManifest(data: unknown): PluginManifest | null {
  if (manifestProblems(data).length > 0) return null;
  const obj = data as Record<string, unknown>;

  const api = typeof obj.api === "number" ? obj.api : 1;

  return {
    name: obj.name as string,
    version: obj.version as string,
    api,
    description: obj.description as string,
    extensions: obj.extensions as string[],
    entry: obj.entry as string,
    author: typeof obj.author === "string" ? obj.author : undefined,
    homepage: typeof obj.homepage === "string" ? obj.homepage : undefined,
    license: typeof obj.license === "string" ? obj.license : undefined,
  };
}
