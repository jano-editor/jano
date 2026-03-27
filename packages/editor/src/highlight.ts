import type { LanguagePlugin, HighlightToken, HighlightPatterns } from "./plugins/types.ts";

export function tokenizeLine(line: string, plugin: LanguagePlugin | null): HighlightToken[] {
  if (!plugin?.highlight) return [];

  const tokens: HighlightToken[] = [];
  const { keywords, patterns } = plugin.highlight;

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

  // priority order: comments > strings > numbers > keywords > types > functions > operators > variables
  const order: (keyof HighlightPatterns)[] = [
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

  if (patterns) {
    for (const type of order) {
      const pattern = patterns[type];
      if (!pattern) continue;

      // reset regex
      const re = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        addToken(match.index, match.index + match[0].length, type);
        if (match[0].length === 0) re.lastIndex++;
      }
    }
  }

  // keywords from word list (only if not already claimed)
  if (keywords && keywords.length > 0) {
    const kwPattern = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = kwPattern.exec(line)) !== null) {
      addToken(match.index, match.index + match[0].length, "keyword");
    }
  }

  return tokens.sort((a, b) => a.start - b.start);
}
