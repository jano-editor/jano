import { showSearch } from "@jano-editor/ui";
import type { Session } from "./session.ts";

let lastSearchQuery = "";
let lastReplaceText = "";
let lastSelectedIndex: number | undefined;

export async function openSearch(s: Session): Promise<void> {
  const result = await showSearch(
    s.input,
    s.screen,
    s.draw,
    s.editor.lines,
    {
      initialQuery: lastSearchQuery,
      initialReplace: lastReplaceText,
      cursorLine: s.cm.primary.y,
      cursorCol: s.cm.primary.x,
      lastSelectedIndex,
      border: "round",
    },
    s.update,
  );

  lastSearchQuery = result.query;
  lastSelectedIndex = result.selectedIndex;
  // only remember replace text if user actually replaced something
  if (result.type === "replace" || result.type === "replaceAll") {
    lastReplaceText = result.replacement;
  } else {
    lastReplaceText = "";
  }

  const p = s.cm.primary;
  s.cm.clearExtras();

  if (result.type === "jump") {
    p.y = result.match.line;
    p.x = result.match.col;
    p.anchor = null;
  }

  if (result.type === "replace") {
    // replace single match
    s.undo.snapshot("replace", { x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());
    const m = result.match;
    const line = s.editor.lines[m.line];
    s.editor.lines[m.line] =
      line.substring(0, m.col) + result.replacement + line.substring(m.col + m.length);
    s.editor.dirty = true;
    p.y = m.line;
    p.x = m.col + result.replacement.length;
    p.anchor = null;
    s.undo.commit({ x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());

    // reopen search to continue replacing
    s.update();
    void openSearch(s);
    return;
  }

  if (result.type === "replaceAll") {
    s.undo.snapshot("replace-all", { x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());
    // apply replacements bottom-up to preserve positions
    const sorted = [...result.matches].sort((a, b) => b.line - a.line || b.col - a.col);
    for (const m of sorted) {
      const line = s.editor.lines[m.line];
      s.editor.lines[m.line] =
        line.substring(0, m.col) + result.replacement + line.substring(m.col + m.length);
    }
    s.editor.dirty = true;
    s.undo.commit({ x: p.x, y: p.y }, s.editor.lines, s.cm.saveState());
  }

  s.update();
}
