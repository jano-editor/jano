import type { LanguagePlugin, HighlightToken, HighlightPatterns } from "./plugins/types.ts";
import { log } from "./utils/logger.ts";

// priority order: comments > strings > numbers > keywords > types > functions > operators > variables
const ORDER: (keyof HighlightPatterns)[] = [
  "comment",
  "string",
  "number",
  "keyword",
  "type",
  "function",
  "operator",
  "variable",
  "property",
  "tag",
  "attribute",
  "constant",
  "builtin",
  "punctuation",
];

interface CompiledHighlight {
  patterns: { type: keyof HighlightPatterns; re: RegExp }[];
  keywords: RegExp | null;
}

// compiled once per plugin instead of once per line and frame
const compiled = new WeakMap<LanguagePlugin, CompiledHighlight>();

// highlighting runs per line and frame, so each plugin's failure is logged only once
const failedPlugins = new WeakSet<LanguagePlugin>();

function reportFailure(plugin: LanguagePlugin, err: unknown) {
  if (failedPlugins.has(plugin)) return;
  failedPlugins.add(plugin);
  log.error({
    action: "plugin_hook_failed",
    plugin: plugin.name,
    hook: "highlight",
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}

function isToken(t: unknown): t is HighlightToken {
  if (typeof t !== "object" || t === null) return false;
  const { start, end, type } = t as HighlightToken;
  return Number.isFinite(start) && Number.isFinite(end) && typeof type === "string";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(plugin: LanguagePlugin): CompiledHighlight {
  let result = compiled.get(plugin);
  if (result) return result;

  const { keywords, patterns } = plugin.highlight ?? {};
  result = { patterns: [], keywords: null };

  for (const type of ORDER) {
    const pattern = patterns?.[type];
    if (pattern) {
      result.patterns.push({
        type,
        re: new RegExp(pattern.source, pattern.flags.replace("g", "") + "g"),
      });
    }
  }

  // empty keywords would match everywhere with zero length
  const words = keywords?.filter((k) => typeof k === "string" && k.length > 0) ?? [];
  if (words.length > 0) {
    // longest first so "c++" wins over "c"; lookarounds instead of \b also work for symbols
    const alternatives = words.sort((a, b) => b.length - a.length).map(escapeRegExp);
    result.keywords = new RegExp(`(?<!\\w)(?:${alternatives.join("|")})(?!\\w)`, "g");
  }

  compiled.set(plugin, result);
  return result;
}

export function tokenizeLine(
  line: string,
  plugin: LanguagePlugin | null,
  lineIndex?: number,
  lines?: readonly string[],
): HighlightToken[] {
  if (!plugin) return [];
  try {
    // custom highlighting takes priority
    if (plugin.highlightLine && lineIndex !== undefined && lines) {
      const tokens = plugin.highlightLine(line, lineIndex, lines);
      return Array.isArray(tokens) ? tokens.filter(isToken) : [];
    }
    if (!plugin.highlight) return [];
    return tokenizeWithPatterns(line, compile(plugin));
  } catch (err) {
    reportFailure(plugin, err);
    return [];
  }
}

function tokenizeWithPatterns(line: string, hl: CompiledHighlight): HighlightToken[] {
  const tokens: HighlightToken[] = [];

  // track which positions are already claimed (higher priority first)
  const claimed = new Set<number>();

  function addToken(start: number, end: number, type: HighlightToken["type"]) {
    // skip if any position already claimed
    for (let i = start; i < end; i++) {
      if (claimed.has(i)) return;
    }
    tokens.push({ start, end, type });
    for (let i = start; i < end; i++) {
      claimed.add(i);
    }
  }

  for (const { type, re } of hl.patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      addToken(match.index, match.index + match[0].length, type);
      if (match[0].length === 0) re.lastIndex++;
    }
  }

  // keywords from word list (only if not already claimed)
  if (hl.keywords) {
    hl.keywords.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = hl.keywords.exec(line)) !== null) {
      addToken(match.index, match.index + match[0].length, "keyword");
    }
  }

  return tokens.sort((a, b) => a.start - b.start);
}
