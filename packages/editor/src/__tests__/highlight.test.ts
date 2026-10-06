import { describe, it, expect } from "bun:test";
import { tokenizeLine } from "../highlight.ts";
import type { LanguagePlugin } from "../plugins/types.ts";

const testPlugin: LanguagePlugin = {
  name: "Test",
  extensions: [".test"],
  highlight: {
    keywords: ["const", "let", "function", "return"],
    patterns: {
      comment: /\/\/.*$/gm,
      string: /'[^']*'|"[^"]*"/g,
      number: /\b\d+\b/g,
    },
  },
};

describe("tokenizeLine", () => {
  it("returns empty for no plugin", () => {
    expect(tokenizeLine("hello", null)).toEqual([]);
  });

  it("tokenizes keywords", () => {
    const tokens = tokenizeLine("const x = 5", testPlugin);
    const kwToken = tokens.find((t) => t.type === "keyword");
    expect(kwToken).toBeDefined();
    expect(kwToken!.start).toBe(0);
    expect(kwToken!.end).toBe(5);
  });

  it("tokenizes strings", () => {
    const tokens = tokenizeLine('const x = "hello"', testPlugin);
    const strToken = tokens.find((t) => t.type === "string");
    expect(strToken).toBeDefined();
    expect(strToken!.start).toBe(10);
    expect(strToken!.end).toBe(17);
  });

  it("comments have higher priority than keywords", () => {
    const tokens = tokenizeLine("// const is a keyword", testPlugin);
    const commentToken = tokens.find((t) => t.type === "comment");
    expect(commentToken).toBeDefined();
    expect(commentToken!.start).toBe(0);
    // "const" inside comment should NOT have its own token
    const kwToken = tokens.find((t) => t.type === "keyword");
    expect(kwToken).toBeUndefined();
  });

  it("strings have higher priority than numbers inside them", () => {
    const tokens = tokenizeLine('"item 42"', testPlugin);
    const numToken = tokens.find((t) => t.type === "number");
    expect(numToken).toBeUndefined();
  });

  it("returns tokens sorted by position", () => {
    const tokens = tokenizeLine("let x = 42", testPlugin);
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].start).toBeGreaterThanOrEqual(tokens[i - 1].start);
    }
  });
});

describe("tokenizeLine with broken plugins", () => {
  it("survives a throwing highlightLine", () => {
    const plugin: LanguagePlugin = {
      name: "Broken",
      extensions: [".broken"],
      highlightLine: () => {
        throw new Error("boom");
      },
    };
    expect(tokenizeLine("x", plugin, 0, ["x"])).toEqual([]);
    expect(tokenizeLine("x", plugin, 0, ["x"])).toEqual([]);
  });

  it("ignores a non-array highlightLine result", () => {
    const plugin = {
      name: "Weird",
      extensions: [".weird"],
      highlightLine: () => null,
    } as unknown as LanguagePlugin;
    expect(tokenizeLine("x", plugin, 0, ["x"])).toEqual([]);
  });

  it("escapes regex characters in keywords", () => {
    const plugin: LanguagePlugin = {
      name: "Cpp",
      extensions: [".cpp"],
      highlight: { keywords: ["c++", "c", "int"] },
    };
    const tokens = tokenizeLine("c++ int x", plugin);
    expect(tokens.map((t) => [t.start, t.end])).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });

  it("keeps word boundaries for plain keywords", () => {
    const plugin: LanguagePlugin = {
      name: "Kw",
      extensions: [".kw"],
      highlight: { keywords: ["in"] },
    };
    expect(tokenizeLine("int in", plugin).map((t) => t.start)).toEqual([4]);
  });

  it("ignores empty keywords", () => {
    const plugin: LanguagePlugin = {
      name: "Empty",
      extensions: [".empty"],
      highlight: { keywords: ["", "let"] },
    };
    expect(tokenizeLine("let x", plugin)).toEqual([{ start: 0, end: 3, type: "keyword" }]);
  });
});
