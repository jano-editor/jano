export type RGB = [number, number, number];

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
  start: number;
  end: number;
  type: string;
}

// ----- Raw Data Types -----

export interface Position {
  line: number;
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
  // plugin can handle the key itself and prevent default behavior
  onKeyDown?(key: KeyInfo, context: PluginContext): KeyResult | null;

  // fired after each cursor action (newline, char typed, delete, etc.)
  // called once per cursor — plugin can respond with edits for that cursor
  onCursorAction?(context: PluginContext): EditResult | null;

  // fired on explicit format request (F3) — whole document
  onFormat?(context: PluginContext): EditResult | null;

  // fired on save
  onSave?(context: PluginContext): EditResult | null;

  // fired when file is opened
  onOpen?(context: PluginContext): void;

  // validate document content — called async, debounced
  // return diagnostics (errors, warnings) for the editor to display
  onValidate?(lines: readonly string[]): Diagnostic[];

  // return completion candidates at the current cursor position
  onComplete?(context: PluginContext): CompletionItem[] | null;
}
