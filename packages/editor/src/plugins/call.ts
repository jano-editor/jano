import { log } from "../utils/logger.ts";
import type { LanguagePlugin } from "./types.ts";

// only log non-failure hook calls when they're actually interesting:
// either they took noticeable time or they returned a real edit result.
// otherwise onCursorAction floods the log on every keystroke with zero-info noise.
const SLOW_HOOK_MS = 5;

/**
 * Call a plugin hook with logging + error isolation.
 *
 * - On crash: always logs `plugin_hook_failed` with error + stack and returns null.
 * - On success with a real result: logs `plugin_hook_result` at debug level.
 * - On success with no result AND duration < 5ms: silent. Prevents per-keystroke spam.
 * - On success taking ≥ 5ms: logs `plugin_hook_slow` at debug level so perf issues show up.
 *
 * Plugins should NEVER be able to crash the editor. Always call plugin methods through this
 * wrapper so failures are isolated and visible in the debug log.
 */
export function callPluginHook<T>(
  plugin: Pick<LanguagePlugin, "name">,
  hook: string,
  fn: () => T,
): T | null {
  const start = Date.now();
  try {
    const result = fn();
    const durationMs = Date.now() - start;
    const hasResult = result !== null && result !== undefined;

    if (hasResult) {
      log.debug({ action: "plugin_hook_result", plugin: plugin.name, hook, durationMs });
    } else if (durationMs >= SLOW_HOOK_MS) {
      log.debug({ action: "plugin_hook_slow", plugin: plugin.name, hook, durationMs });
    }
    return result;
  } catch (err) {
    log.error({
      action: "plugin_hook_failed",
      plugin: plugin.name,
      hook,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return null;
  }
}
