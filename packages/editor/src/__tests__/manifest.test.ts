import { describe, it, expect } from "vitest";
import { validateManifest, CURRENT_API_VERSION } from "../plugins/manifest.ts";

describe("validateManifest", () => {
  const valid = {
    name: "test-plugin",
    version: "1.0.0",
    api: 1,
    description: "A test plugin",
    extensions: [".ts"],
    entry: "index.js",
  };

  it("accepts valid manifest", () => {
    const result = validateManifest(valid);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-plugin");
    expect(result!.api).toBe(1);
  });

  it("rejects missing name", () => {
    expect(validateManifest({ ...valid, name: "" })).toBeNull();
  });

  it("rejects missing extensions", () => {
    expect(validateManifest({ ...valid, extensions: [] })).toBeNull();
  });

  it("rejects non-string extensions", () => {
    expect(validateManifest({ ...valid, extensions: [42] })).toBeNull();
  });

  it("rejects null/undefined input", () => {
    expect(validateManifest(null)).toBeNull();
    expect(validateManifest(undefined)).toBeNull();
  });

  it("defaults api to 1 if missing", () => {
    const { api: _, ...noApi } = valid;
    const result = validateManifest(noApi);
    expect(result).not.toBeNull();
    expect(result!.api).toBe(1);
  });

  it("includes optional fields when present", () => {
    const result = validateManifest({ ...valid, author: "me", homepage: "https://x.dev" });
    expect(result!.author).toBe("me");
    expect(result!.homepage).toBe("https://x.dev");
  });

  it("CURRENT_API_VERSION is defined", () => {
    expect(CURRENT_API_VERSION).toBeGreaterThanOrEqual(1);
  });
});
