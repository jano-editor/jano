// re-export everything from the shared plugin types package
export type {
  RGB,
  HighlightPatterns,
  HighlightToken,
  Position,
  Cursor,
  Range,
  ActionType,
  CursorAction,
  KeyInfo,
  KeyResult,
  PluginContext,
  TextEdit,
  EditResult,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionKind,
  LanguagePlugin,
} from "@jano-editor/plugin-types";

import type { RGB } from "@jano-editor/plugin-types";

// color theme for token types (editor-internal, not part of the plugin API)
export const tokenColors: Record<string, RGB> = {
  keyword: [198, 120, 221],
  string: [152, 195, 121],
  comment: [92, 99, 112],
  number: [209, 154, 102],
  type: [229, 192, 123],
  function: [97, 175, 239],
  operator: [86, 182, 194],
  variable: [224, 108, 117],
  property: [224, 108, 117],
  tag: [224, 108, 117],
  attribute: [209, 154, 102],
  constant: [209, 154, 102],
  builtin: [198, 120, 221],
  punctuation: [171, 178, 191],
};
