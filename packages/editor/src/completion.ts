import type { CompletionItem, LanguagePlugin, PluginContext } from "./plugins/types.ts";
import { callPluginHook } from "./plugins/call.ts";

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

export interface CursorLike {
  x: number;
  y: number;
  anchor: { x: number; y: number } | null;
}

/**
 * Apply a completion text at every cursor position.
 *
 * For each cursor, the word prefix to the left (matching \w+) is replaced with
 * the completion text. Cursors are processed top-to-bottom / left-to-right, and
 * after each edit the positions of the remaining cursors are shifted so that
 * inserts and deletions stay consistent across multiple cursors on the same line.
 *
 * Mutates `lines` and the `cursors` in place.
 */
export function applyCompletionAtCursors(
  lines: string[],
  cursors: readonly CursorLike[],
  text: string,
): void {
  const sorted = [...cursors].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    const line = lines[c.y] ?? "";

    // word boundary going left from the cursor
    let wordStart = c.x;
    while (wordStart > 0 && /\w/.test(line[wordStart - 1]!)) wordStart--;

    const replacedLen = c.x - wordStart;
    const before = line.substring(0, wordStart);
    const after = line.substring(c.x);

    if (text.includes("\n")) {
      const parts = text.split("\n");
      lines[c.y] = before + parts[0];
      for (let k = 1; k < parts.length; k++) {
        lines.splice(c.y + k, 0, parts[k]! + (k === parts.length - 1 ? after : ""));
      }
      const insertedLines = parts.length - 1;
      const newY = c.y + insertedLines;
      const newX = parts[parts.length - 1]!.length;

      // shift remaining cursors: on same line-to-right → onto the new last line;
      // on lines below → shift y down by insertedLines
      for (let j = i + 1; j < sorted.length; j++) {
        const o = sorted[j]!;
        if (o.y === c.y && o.x > c.x) {
          o.y = newY;
          o.x = newX + (o.x - c.x);
        } else if (o.y > c.y) {
          o.y += insertedLines;
        }
      }

      c.y = newY;
      c.x = newX;
    } else {
      lines[c.y] = before + text + after;
      const delta = text.length - replacedLen;

      // shift remaining cursors on the same line that were to the right of this edit
      for (let j = i + 1; j < sorted.length; j++) {
        const o = sorted[j]!;
        if (o.y === c.y && o.x > c.x) {
          o.x += delta;
        }
      }

      c.x = wordStart + text.length;
    }
    c.anchor = null;
  }
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
    const pluginItems = callPluginHook(plugin, "onComplete", () => plugin.onComplete!(ctx));
    if (pluginItems) {
      for (const item of pluginItems) {
        if (!seen.has(item.label)) {
          seen.add(item.label);
          items.push(item);
        }
      }
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
