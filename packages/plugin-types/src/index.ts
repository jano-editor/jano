export type RGB = [number, number, number];

/**
 * Plugin API version this package describes. Put it in plugin.json as "api".
 * v2 adds async hooks (onFormat, onSave, onOpen, onValidate, onComplete may return a Promise)
 * and wires up onSave / onOpen. Plugins that return Promises must declare api 2, older jano
 * versions then refuse to load them instead of misreading the Promise.
 */
export const PLUGIN_API_VERSION = 2;

/** A hook result, either directly or as a Promise (api 2). */
export type MaybePromise<T> = T | Promise<T>;

// ----- Highlighting -----

export interface HighlightPatterns {
  comment?: RegExp;
  string?: RegExp;
  number?: RegExp;
  keyword?: RegExp;
  type?: RegExp;
  function?: RegExp;
  operator?: RegExp;
  variable?: RegExp;
  property?: RegExp;
  tag?: RegExp;
  attribute?: RegExp;
  constant?: RegExp;
  builtin?: RegExp;
  punctuation?: RegExp;
}

export interface HighlightToken {
  /** UTF-16 string index, like String.prototype.slice */
  start: number;
  end: number;
  type: string;
}

// ----- Raw Data Types -----

export interface Position {
  line: number;
  /** UTF-16 string index into the line (not a screen column, tabs and emoji count as their length) */
  col: number;
}

export interface Cursor {
  position: Position;
  anchor: Position | null;
}

export interface Range {
  start: Position;
  end: Position;
}

// ----- Cursor Action (fired per cursor, after the edit happened) -----

export type ActionType = "newline" | "char" | "delete" | "backspace" | "paste" | "tab";

export interface CursorAction {
  type: ActionType;
  // the cursor this action applies to
  cursor: Cursor;
  // where the cursor was before the action
  previousPosition: Position;
  // what was typed (for 'char')
  char?: string;
  // what was pasted (for 'paste')
  pastedText?: string;
  // what was deleted (for 'backspace' and 'delete')
  deletedText?: string;
}

// ----- Key Event (raw key press, before editor processes it) -----

export interface KeyInfo {
  name: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface KeyResult {
  // true = plugin handled the key, editor should NOT process it
  handled: boolean;
  // optional edits to apply
  edit?: EditResult;
}

// ----- Plugin Context -----

export interface PluginContext {
  filePath: string;
  fileName: string;
  extension: string;

  lines: readonly string[];
  lineCount: number;

  // all cursors in the editor
  cursors: readonly Cursor[];

  // the action that just happened (per-cursor hook)
  action?: CursorAction;

  // viewport
  viewport: {
    firstVisibleLine: number;
    lastVisibleLine: number;
    width: number;
    height: number;
  };

  dirty: boolean;
  language: string;

  // editor settings — plugins should respect these
  settings: {
    tabSize: number;
    insertSpaces: boolean;
  };
}

// ----- Plugin Responses -----

export interface TextEdit {
  range: Range;
  text: string;
}

export interface EditResult {
  edits?: TextEdit[];
  replaceAll?: string[];
  cursors?: Cursor[];
}

// ----- Diagnostics -----

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  line: number;
  col: number;
  endCol?: number;
  severity: DiagnosticSeverity;
  message: string;
}

// ----- Completion -----

export type CompletionKind =
  | "keyword"
  | "function"
  | "variable"
  | "property"
  | "type"
  | "constant"
  | "snippet"
  | "text";

export interface CompletionItem {
  label: string;
  insertText?: string;
  detail?: string;
  kind?: CompletionKind;
}

// ----- Plugin Interface -----

export interface LanguagePlugin {
  name: string;
  extensions: string[];

  // syntax highlighting — regex-based (simple, per-line)
  highlight?: {
    keywords?: string[];
    patterns?: HighlightPatterns;
  };

  // custom highlighting — full control, multiline-aware
  // if provided, this is used instead of regex-based highlight
  highlightLine?(line: string, lineIndex: number, lines: readonly string[]): HighlightToken[];

  // fired on key press, before the editor processes it
  // plugin can handle the key itself and prevent default behavior.
  // stays synchronous: it runs on every keystroke.
  onKeyDown?(key: KeyInfo, context: PluginContext): KeyResult | null;

  // fired after each cursor action (newline, char typed, delete, etc.)
  // called once per cursor — plugin can respond with edits for that cursor.
  // stays synchronous: it runs on every keystroke.
  onCursorAction?(context: PluginContext): EditResult | null;

  // fired on explicit format request (F3) — whole document.
  // a late result is dropped if the user edited the document in the meantime.
  onFormat?(context: PluginContext): MaybePromise<EditResult | null>;

  // fired before the file is written. returned edits are applied and saved (undoable).
  onSave?(context: PluginContext): MaybePromise<EditResult | null>;

  // fired when a file is opened (on start and after restoring a backup), not after saves
  onOpen?(context: PluginContext): MaybePromise<void>;

  // validate document content — debounced, only the newest result is used
  // return diagnostics (errors, warnings) for the editor to display
  onValidate?(lines: readonly string[]): MaybePromise<Diagnostic[]>;

  // return completion candidates at the current cursor position.
  // a late result is dropped if the cursor moved in the meantime.
  onComplete?(context: PluginContext): MaybePromise<CompletionItem[] | null>;
}
