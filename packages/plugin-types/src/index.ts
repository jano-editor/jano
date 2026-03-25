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

// ----- Plugin Context -----

export interface PluginContext {
  filePath: string;
  fileName: string;
  extension: string;

  lines: readonly string[];
  lineCount: number;

  cursors: readonly Cursor[];

  event: {
    type: 'newline' | 'char' | 'format' | 'save' | 'open' | 'delete' | 'paste';
    char?: string;
    pastedText?: string;
    deletedText?: string;
  };

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

  highlight?: {
    keywords?: string[];
    patterns?: HighlightPatterns;
  };

  onNewLine?(context: PluginContext): EditResult | null;
  onCharTyped?(context: PluginContext): EditResult | null;
  onFormat?(context: PluginContext): EditResult | null;
  onSave?(context: PluginContext): EditResult | null;
  onOpen?(context: PluginContext): void;
  onDelete?(context: PluginContext): EditResult | null;
  onPaste?(context: PluginContext): EditResult | null;
}
