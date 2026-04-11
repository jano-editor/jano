import type { Screen, Draw, InputManager } from "@jano-editor/ui";
import type { EditorState } from "../editor.ts";
import type { CursorManager } from "../cursor-manager.ts";
import type { UndoManager } from "../undo.ts";
import type { Validator } from "../validator.ts";
import type { LanguagePlugin } from "../plugins/types.ts";

// Bundle of editor state and actions every dialog needs.
// Properties are mutable so dialogs always see the current value
// (e.g. plugin/validator after a save+reload).
export interface Session {
  screen: Screen;
  draw: Draw;
  input: InputManager;
  editor: EditorState;
  cm: CursorManager;
  undo: UndoManager;
  validator: Validator;
  plugin: LanguagePlugin | null;
  pluginVersion: string | undefined;
  update(this: void): void;
  reloadPlugin(this: void): void;
}
