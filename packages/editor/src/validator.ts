import type { Diagnostic, LanguagePlugin } from "./plugins/types.ts";

const DEBOUNCE_MS = 500;

export interface ValidatorState {
  diagnostics: Diagnostic[];
}

export interface Validator {
  readonly state: ValidatorState;
  schedule(lines: readonly string[]): void;
  clear(): void;
}

export function createValidator(plugin: LanguagePlugin | null, onDone?: () => void): Validator {
  const state: ValidatorState = {
    diagnostics: [],
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastInput = "";

  return {
    get state() {
      return state;
    },

    schedule(lines: readonly string[]) {
      if (!plugin?.onValidate) return;

      const input = lines.join("\n");
      if (input === lastInput) return;
      lastInput = input;

      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        try {
          state.diagnostics = plugin.onValidate!(lines);
        } catch {
          state.diagnostics = [];
        }
        onDone?.();
      }, DEBOUNCE_MS);
    },

    clear() {
      if (timer) clearTimeout(timer);
      lastInput = "";
      state.diagnostics = [];
    },
  };
}
