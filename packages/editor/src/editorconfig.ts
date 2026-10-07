import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Eol } from "./editor.ts";

// .editorconfig support (https://editorconfig.org): per-project indentation, line endings
// and save rules that every editor understands. Small parser, no dependency.

export interface EditorConfigResult {
  /** .editorconfig files that applied, nearest first */
  files: string[];
  /** overrides for the editor settings of this file */
  settings: { tabSize?: number; insertSpaces?: boolean };
  /** only used for new files, existing files keep what they have */
  eol?: Eol;
  bom?: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
}

interface Section {
  pattern: string;
  props: Record<string, string>;
}

interface ParsedFile {
  root: boolean;
  sections: Section[];
}

/** Parses an .editorconfig file. Keys are lowercased, so are values (the spec treats them case-insensitive). */
export function parseEditorConfig(text: string): ParsedFile {
  const parsed: ParsedFile = { root: false, sections: [] };
  let current: Section | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      current = { pattern: line.slice(1, -1), props: {} };
      parsed.sections.push(current);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line
      .slice(eq + 1)
      .trim()
      .toLowerCase();
    if (current) current.props[key] = value;
    else if (key === "root") parsed.root = value === "true"; // only valid before any section
  }
  return parsed;
}

/**
 * Turns an editorconfig glob into a matcher for paths relative to the .editorconfig folder
 * (forward slashes). Supports *, **, ?, [abc], [!abc], {a,b} (nestable) and {1..10}.
 */
export function globMatcher(pattern: string): (relPath: string) => boolean {
  // without a slash the pattern matches the file name in any subfolder
  const glob = pattern.includes("/") ? pattern.replace(/^\//, "") : `**/${pattern}`;
  const ranges: [number, number][] = [];
  const regex = new RegExp(`^${convertGlob(glob, ranges)}$`);
  return (relPath) => {
    const m = regex.exec(relPath);
    if (!m) return false;
    // only huge number ranges are captured, small ones are spelled out in the regex
    return ranges.every(([lo, hi], idx) => {
      const captured = m[idx + 1];
      if (captured === undefined) return true; // that alternative wasn't taken
      const n = Number(captured);
      return String(n) === captured && n >= lo && n <= hi;
    });
  };
}

// ranges up to this size become a plain alternation (1|2|3), so no check after matching
const MAX_SPELLED_OUT_RANGE = 1000;

function convertGlob(glob: string, ranges: [number, number][]): string {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "\\" && i + 1 < glob.length) {
      re += escapeRe(glob[++i]);
    } else if (c === "*") {
      if (glob[i + 1] !== "*") {
        re += "[^/]*";
      } else if (glob[i + 2] === "/" && (i === 0 || glob[i - 1] === "/")) {
        // "**/" at the start of a segment may match nothing: "**/a" matches "a" and "x/a"
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      const set = end === -1 ? "" : glob.slice(i + 1, end);
      const negate = set.startsWith("!");
      const chars = negate ? set.slice(1) : set;
      if (end === -1 || !chars || set.includes("/")) {
        // unclosed, empty or containing a slash: literal text, like editorconfig-core
        re += "\\[";
      } else {
        re += `[${negate ? "^" : ""}${chars.replace(/[\\\]^]/g, "\\$&")}]`;
        i = end;
      }
    } else if (c === "{") {
      const end = matchingBrace(glob, i);
      if (end === -1) {
        re += "\\{";
        continue;
      }
      const inner = glob.slice(i + 1, end);
      const range = /^(-?\d+)\.\.(-?\d+)$/.exec(inner);
      const parts = splitTopLevel(inner);
      if (range) {
        re += numberRange(Number(range[1]), Number(range[2]), ranges);
      } else if (parts.length > 1) {
        re += `(?:${parts.map((part) => convertGlob(part, ranges)).join("|")})`;
      } else {
        // braces without a comma are literal: "{single}" matches "{single}"
        re += `\\{${convertGlob(inner, ranges)}\\}`;
      }
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  return re;
}

function numberRange(a: number, b: number, ranges: [number, number][]): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo > MAX_SPELLED_OUT_RANGE) {
    ranges.push([lo, hi]);
    return "(-?\\d+)";
  }
  const numbers: string[] = [];
  for (let n = lo; n <= hi; n++) numbers.push(String(n));
  // longest first, so "12" is tried before "1"
  numbers.sort((x, y) => y.length - x.length);
  return `(?:${numbers.join("|")})`;
}

/** Index of the "}" closing the "{" at `start`, or -1. */
function matchingBrace(glob: string, start: number): number {
  let depth = 0;
  for (let i = start; i < glob.length; i++) {
    if (glob[i] === "\\") i++;
    else if (glob[i] === "{") depth++;
    else if (glob[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Splits brace content at commas that aren't inside nested braces. */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\") i++;
    else if (inner[i] === "{") depth++;
    else if (inner[i] === "}") depth--;
    else if (inner[i] === "," && depth === 0) {
      parts.push(inner.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(inner.slice(last));
  return parts;
}

function escapeRe(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/** Collects the .editorconfig properties for a file, walking up until `root = true`. */
export function editorConfigProps(filePath: string): {
  props: Record<string, string>;
  files: string[];
} {
  const abs = resolve(filePath);
  const found: { path: string; parsed: ParsedFile }[] = [];
  let dir = dirname(abs);
  while (true) {
    const candidate = join(dir, ".editorconfig");
    if (existsSync(candidate)) {
      try {
        const parsed = parseEditorConfig(readFileSync(candidate, "utf8"));
        found.push({ path: candidate, parsed });
        if (parsed.root) break;
      } catch {
        // unreadable config, skip it like other editors do
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // farthest first, so closer files and later sections win
  const props: Record<string, string> = {};
  for (const { path, parsed } of [...found].reverse()) {
    const rel = relative(dirname(path), abs).split(sep).join("/");
    for (const section of parsed.sections) {
      if (globMatcher(section.pattern)(rel)) Object.assign(props, section.props);
    }
  }
  for (const [key, value] of Object.entries(props)) {
    if (value === "unset") delete props[key];
  }
  return { props, files: found.map((f) => f.path) };
}

/** What jano does with the properties of one file. */
export function resolveEditorConfig(filePath: string): EditorConfigResult {
  const { props, files } = editorConfigProps(filePath);
  const result: EditorConfigResult = { files, settings: {} };

  const style = props.indent_style;
  if (style === "space") result.settings.insertSpaces = true;
  if (style === "tab") result.settings.insertSpaces = false;

  const size = positiveInt(props.indent_size);
  const tabWidth = positiveInt(props.tab_width);
  // jano has one width for both: indent size for spaces, tab width for tabs
  const width = style === "tab" ? (tabWidth ?? size) : (size ?? tabWidth);
  if (width) result.settings.tabSize = width;

  if (props.end_of_line === "lf") result.eol = "\n";
  if (props.end_of_line === "crlf") result.eol = "\r\n";
  if (props.charset === "utf-8") result.bom = false;
  if (props.charset === "utf-8-bom") result.bom = true;
  if (props.trim_trailing_whitespace === "true") result.trimTrailingWhitespace = true;
  if (props.trim_trailing_whitespace === "false") result.trimTrailingWhitespace = false;
  if (props.insert_final_newline === "true") result.insertFinalNewline = true;
  if (props.insert_final_newline === "false") result.insertFinalNewline = false;
  return result;
}

function positiveInt(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 16 ? n : undefined;
}

/**
 * Applies trim_trailing_whitespace and insert_final_newline to the lines.
 * Returns the new lines, or null if nothing changes.
 */
export function applySaveRules(
  lines: readonly string[],
  rules: Pick<EditorConfigResult, "trimTrailingWhitespace" | "insertFinalNewline">,
): string[] | null {
  let next = [...lines];
  if (rules.trimTrailingWhitespace) next = next.map((l) => l.replace(/[ \t]+$/, ""));

  // lines ending in "" means the file ends with a newline. an empty file stays empty.
  const isEmpty = next.length === 1 && next[0] === "";
  const endsWithNewline = next.length > 1 && next[next.length - 1] === "";
  if (rules.insertFinalNewline === true && !isEmpty && !endsWithNewline) next.push("");
  if (rules.insertFinalNewline === false && endsWithNewline) next.pop();

  const changed = next.length !== lines.length || next.some((l, i) => l !== lines[i]);
  return changed ? next : null;
}
