import type { CompletionItem, LanguagePlugin, PluginContext } from "./plugins/types.ts";

export interface CompletionState {
  active: boolean;
  items: CompletionItem[];
  filtered: CompletionItem[];
  selectedIndex: number;
  scrollOffset: number;
  prefix: string; // the text typed since completion started
  startX: number; // cursor x when completion was triggered
  startY: number;
}

export function createCompletionState(): CompletionState {
  return {
    active: false,
    items: [],
    filtered: [],
    selectedIndex: 0,
    scrollOffset: 0,
    prefix: "",
    startX: 0,
    startY: 0,
  };
}

export function closeCompletion(state: CompletionState): void {
  state.active = false;
  state.items = [];
  state.filtered = [];
  state.selectedIndex = 0;
  state.scrollOffset = 0;
  state.prefix = "";
}

export function filterCompletions(state: CompletionState, prefix: string): void {
  state.prefix = prefix;
  const lower = prefix.toLowerCase();
  state.filtered = lower
    ? state.items.filter((item) => item.label.toLowerCase().includes(lower))
    : state.items;
  state.selectedIndex = 0;
  state.scrollOffset = 0;

  // close if nothing matches
  if (state.filtered.length === 0) {
    closeCompletion(state);
  }
}

export function getBufferWordCompletions(
  lines: readonly string[],
  cursorLine: number,
  cursorCol: number,
): CompletionItem[] {
  const seen = new Set<string>();
  const items: CompletionItem[] = [];

  // extract the partial word at cursor
  const line = lines[cursorLine] ?? "";
  let wordStart = cursorCol;
  while (wordStart > 0 && /\w/.test(line[wordStart - 1])) wordStart--;
  const partial = line.substring(wordStart, cursorCol);
  if (partial.length === 0) return [];

  const lower = partial.toLowerCase();

  for (const l of lines) {
    // match all words in the line
    let match: RegExpExecArray | null;
    const re = /\b\w{2,}\b/g;
    while ((match = re.exec(l)) !== null) {
      const word = match[0];
      if (word.toLowerCase().startsWith(lower) && word !== partial && !seen.has(word)) {
        seen.add(word);
        items.push({ label: word, kind: "text" });
      }
    }
  }

  return items;
}

export function triggerCompletion(
  state: CompletionState,
  plugin: LanguagePlugin | null,
  ctx: PluginContext,
  lines: readonly string[],
  cursorLine: number,
  cursorCol: number,
): void {
  // merge plugin items + buffer word items
  const items: CompletionItem[] = [];
  const seen = new Set<string>();

  if (plugin?.onComplete) {
    try {
      const pluginItems = plugin.onComplete(ctx);
      if (pluginItems) {
        for (const item of pluginItems) {
          if (!seen.has(item.label)) {
            seen.add(item.label);
            items.push(item);
          }
        }
      }
    } catch {
      // plugin error — continue with buffer completion
    }
  }

  // always add buffer words (deduped)
  for (const item of getBufferWordCompletions(lines, cursorLine, cursorCol)) {
    if (!seen.has(item.label)) {
      seen.add(item.label);
      items.push(item);
    }
  }

  if (items.length === 0) {
    closeCompletion(state);
    return;
  }

  // find the prefix (partial word before cursor)
  const line = lines[cursorLine] ?? "";
  let wordStart = cursorCol;
  while (wordStart > 0 && /\w/.test(line[wordStart - 1])) wordStart--;

  state.active = true;
  state.items = items;
  state.prefix = line.substring(wordStart, cursorCol);
  state.startX = wordStart;
  state.startY = cursorLine;
  state.selectedIndex = 0;
  state.scrollOffset = 0;

  // initial filter
  const lower = state.prefix.toLowerCase();
  state.filtered = lower ? items.filter((item) => item.label.toLowerCase().includes(lower)) : items;

  if (state.filtered.length === 0) {
    closeCompletion(state);
  }
}
