import type { Diagnostic, LanguagePlugin } from "./plugins/types.ts";
import { log } from "./utils/logger.ts";

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

      // clear old diagnostics immediately so stale results don't linger
      state.diagnostics = [];

      if (timer) clearTimeout(timer);

      const snapshot = [...lines];
      log.debug({ action: "validator_schedule", plugin: plugin.name, lineCount: snapshot.length });

      timer = setTimeout(() => {
        const start = Date.now();
        try {
          state.diagnostics = plugin.onValidate!(snapshot);
          log.debug({
            action: "validator_run_done",
            plugin: plugin.name,
            diagnosticCount: state.diagnostics.length,
            durationMs: Date.now() - start,
          });
        } catch (err) {
          state.diagnostics = [];
          log.error({
            action: "validator_run_failed",
            plugin: plugin.name,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
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
