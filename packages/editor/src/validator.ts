import type { Diagnostic, LanguagePlugin } from "./plugins/types.ts";
import { log } from "./utils/logger.ts";
import { callPluginHookAsync } from "./plugins/call.ts";

const DEBOUNCE_MS = 500;
const VALIDATE_TIMEOUT_MS = 10_000;

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
  // onValidate may be async (api 2), only the newest run may set diagnostics
  let runId = 0;

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

      const run = ++runId;
      timer = setTimeout(() => {
        const start = Date.now();
        // crashes, rejections and timeouts are logged by the wrapper and come back as null
        void callPluginHookAsync(
          plugin,
          "onValidate",
          () => plugin.onValidate!(snapshot),
          VALIDATE_TIMEOUT_MS,
        ).then((result) => {
          if (run !== runId) return; // superseded by a newer edit
          state.diagnostics = Array.isArray(result) ? result : [];
          log.debug({
            action: "validator_run_done",
            plugin: plugin.name,
            diagnosticCount: state.diagnostics.length,
            durationMs: Date.now() - start,
          });
          onDone?.();
        });
      }, DEBOUNCE_MS);
    },

    clear() {
      runId++;
      if (timer) clearTimeout(timer);
      lastInput = "";
      state.diagnostics = [];
    },
  };
}
