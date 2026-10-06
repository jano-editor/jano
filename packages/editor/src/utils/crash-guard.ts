import type { Screen } from "@jano-editor/ui";
import { log, flushLogs } from "./logger.ts";

// SIGINT is not listed: raw mode turns Ctrl+C into a regular key
const SIGNALS = { SIGTERM: 15, SIGHUP: 1 } as const;

/**
 * Restores the terminal when jano dies unexpectedly. Without this, a crash or
 * kill leaves the shell in the alternate screen with mouse tracking and raw mode on.
 * onDeath runs first, e.g. to back up unsaved changes.
 */
export function installCrashGuard(screen: Screen, onDeath?: () => void): void {
  let restored = false;

  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      onDeath?.();
    } catch {
      // never let the hook block the terminal restore
    }
    try {
      screen.leave();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {
      // terminal may already be gone (SIGHUP)
    }
  };

  const exit = (code: number) => {
    void flushLogs().finally(() => process.exit(code));
  };

  const onCrash = (err: unknown) => {
    if (restored) return;
    log.error({
      action: "editor_crash",
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    restore();
    console.error("[jano] crashed:", err);
    exit(1);
  };

  process.on("uncaughtException", onCrash);
  process.on("unhandledRejection", onCrash);

  for (const [signal, num] of Object.entries(SIGNALS)) {
    process.once(signal, () => {
      log.info({ action: "editor_signal", signal });
      restore();
      exit(128 + num);
    });
  }
}
