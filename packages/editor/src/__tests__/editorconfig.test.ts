import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applySaveRules,
  globMatcher,
  parseEditorConfig,
  resolveEditorConfig,
} from "../editorconfig.ts";

describe("parseEditorConfig", () => {
  it("reads root, sections and lowercases keys and values", () => {
    const parsed = parseEditorConfig(
      "# comment\nroot = true\n\n[*]\nIndent_Style = Space\n; other comment\n[Makefile]\nindent_style=tab\n",
    );
    expect(parsed.root).toBe(true);
    expect(parsed.sections).toEqual([
      { pattern: "*", props: { indent_style: "space" } },
      { pattern: "Makefile", props: { indent_style: "tab" } },
    ]);
  });
});

describe("globMatcher", () => {
  const matches = (pattern: string, path: string) => globMatcher(pattern)(path);

  it("matches file names in any folder when the pattern has no slash", () => {
    expect(matches("*.js", "a.js")).toBe(true);
    expect(matches("*.js", "src/deep/a.js")).toBe(true);
    expect(matches("*.js", "a.ts")).toBe(false);
    expect(matches("Makefile", "sub/Makefile")).toBe(true);
  });

  it("anchors patterns with a slash to the config folder", () => {
    expect(matches("src/*.js", "src/a.js")).toBe(true);
    expect(matches("src/*.js", "src/x/a.js")).toBe(false);
    expect(matches("/src/**.js", "src/x/a.js")).toBe(true);
    expect(matches("lib/**/*.ts", "lib/a.ts")).toBe(true);
  });

  it("supports braces, sets, ? and number ranges", () => {
    expect(matches("*.{js,ts}", "a.ts")).toBe(true);
    expect(matches("*.{js,ts}", "a.py")).toBe(false);
    expect(matches("[Mm]akefile", "makefile")).toBe(true);
    expect(matches("[!M]akefile", "Makefile")).toBe(false);
    expect(matches("file?.txt", "file1.txt")).toBe(true);
    expect(matches("v{1..3}.md", "v2.md")).toBe(true);
    expect(matches("v{1..3}.md", "v7.md")).toBe(false);
  });

  it("treats regex characters literally", () => {
    expect(matches("a+b.(txt)", "a+b.(txt)")).toBe(true);
    expect(matches("a+b.txt", "aab.txt")).toBe(false);
  });
});

describe("resolveEditorConfig", () => {
  const root = mkdtempSync(join(tmpdir(), "jano-ec-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  // root/.editorconfig (root = true) and root/sub/.editorconfig
  writeFileSync(
    join(root, ".editorconfig"),
    [
      "root = true",
      "[*]",
      "indent_style = space",
      "indent_size = 2",
      "end_of_line = lf",
      "insert_final_newline = true",
      "trim_trailing_whitespace = true",
      "[Makefile]",
      "indent_style = tab",
      "tab_width = 8",
      "[*.md]",
      "trim_trailing_whitespace = unset",
    ].join("\n"),
  );
  mkdirSync(join(root, "sub"));
  writeFileSync(
    join(root, "sub", ".editorconfig"),
    "[*.py]\nindent_size = 4\ncharset = utf-8-bom\n",
  );

  it("applies the matching sections", () => {
    const ec = resolveEditorConfig(join(root, "app.js"));
    expect(ec.settings).toEqual({ insertSpaces: true, tabSize: 2 });
    expect(ec.eol).toBe("\n");
    expect(ec.trimTrailingWhitespace).toBe(true);
    expect(ec.insertFinalNewline).toBe(true);
  });

  it("uses tab_width for tab indented files", () => {
    expect(resolveEditorConfig(join(root, "Makefile")).settings).toEqual({
      insertSpaces: false,
      tabSize: 8,
    });
  });

  it("lets closer files override and keeps inherited values", () => {
    const ec = resolveEditorConfig(join(root, "sub", "tool.py"));
    expect(ec.settings).toEqual({ insertSpaces: true, tabSize: 4 });
    expect(ec.bom).toBe(true);
    expect(ec.files).toEqual([join(root, "sub", ".editorconfig"), join(root, ".editorconfig")]);
  });

  it("unset removes a value", () => {
    expect(resolveEditorConfig(join(root, "README.md")).trimTrailingWhitespace).toBeUndefined();
  });

  it("stops at root = true", () => {
    // a config above the root must not apply
    const outer = mkdtempSync(join(tmpdir(), "jano-ec-outer-"));
    writeFileSync(join(outer, ".editorconfig"), "[*]\nindent_size = 7\n");
    mkdirSync(join(outer, "project"));
    writeFileSync(join(outer, "project", ".editorconfig"), "root = true\n");
    expect(resolveEditorConfig(join(outer, "project", "a.txt")).settings).toEqual({});
    rmSync(outer, { recursive: true, force: true });
  });
});

describe("applySaveRules", () => {
  it("trims trailing spaces and tabs", () => {
    expect(applySaveRules(["a  ", "b\t", "c", ""], { trimTrailingWhitespace: true })).toEqual([
      "a",
      "b",
      "c",
      "",
    ]);
  });

  it("adds or removes the final newline", () => {
    expect(applySaveRules(["a"], { insertFinalNewline: true })).toEqual(["a", ""]);
    expect(applySaveRules(["a", ""], { insertFinalNewline: false })).toEqual(["a"]);
  });

  it("leaves an empty file empty and reports no change", () => {
    expect(applySaveRules([""], { insertFinalNewline: true })).toBeNull();
    expect(
      applySaveRules(["a", ""], { insertFinalNewline: true, trimTrailingWhitespace: true }),
    ).toBeNull();
  });
});
