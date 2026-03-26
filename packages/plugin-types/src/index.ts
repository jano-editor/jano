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

export type ActionType = 'newline' | 'char' | 'delete' | 'backspace' | 'paste' | 'tab';

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

// ----- Plugin Interface -----

export interface LanguagePlugin {
  name: string;
  extensions: string[];

  // syntax highlighting
  highlight?: {
    keywords?: string[];
    patterns?: HighlightPatterns;
  };

  // fired after each cursor action (newline, char typed, delete, etc.)
  // called once per cursor — plugin can respond with edits for that cursor
  onCursorAction?(context: PluginContext): EditResult | null;

  // fired on explicit format request (F3) — whole document
  onFormat?(context: PluginContext): EditResult | null;

  // fired on save
  onSave?(context: PluginContext): EditResult | null;

  // fired when file is opened
  onOpen?(context: PluginContext): void;
}
