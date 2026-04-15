import { initLogger, log as evlog } from "evlog";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline, type PipelineDrainFn } from "evlog/pipeline";
import type { DrainContext } from "evlog";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { getCacheDir } from "../plugins/config.ts";

export const isDebug = process.env.JANO_DEBUG === "1";

const LOG_FILE_NAME = "debug.log";
let initialized = false;
let activeDrain: PipelineDrainFn<DrainContext> | null = null;

/**
 * Initialize the logger. Only active in debug mode; otherwise all log calls are no-ops.
 *
 * In debug mode:
 * - Writes structured events to `~/.cache/jano/logs/YYYY-MM-DD.jsonl`
 * - Console output is suppressed (we're in an interactive TTY)
 * - Events are batched and written in order via a drain pipeline
 * - Buffered events are flushed on SIGINT / SIGTERM / beforeExit
 */
export function initDebugLogger(): void {
  if (initialized) return;
  initialized = true;

  if (!isDebug) {
    // disable all evlog emits entirely
    initLogger({ enabled: false });
    return;
  }

  const logsDir = join(getCacheDir(), "logs");

  // clean up previous debug.log in cache root (legacy location, if any)
  const legacy = join(getCacheDir(), LOG_FILE_NAME);
  if (existsSync(legacy)) {
    try {
      unlinkSync(legacy);
    } catch {
      // ignore
    }
  }

  const fsDrain = createFsDrain({
    dir: logsDir,
    pretty: false,
    maxFiles: 7,
  });

  // pipeline batches events and writes them in a single appendFile per flush,
  // which preserves order (the raw fs drain writes each event concurrently)
  const pipeline = createDrainPipeline<DrainContext>({
    batch: { size: 50, intervalMs: 100 },
  });
  activeDrain = pipeline((batch) => fsDrain(batch));

  initLogger({
    env: {
      service: "jano",
      environment: "debug",
      version: process.env.JANO_VERSION,
    },
    silent: true,
    pretty: false,
    minLevel: "debug",
    drain: activeDrain,
  });

  // flush on normal exit (node drains its event loop)
  process.once("beforeExit", () => {
    if (activeDrain) void activeDrain.flush();
  });

  // flush on SIGINT / SIGTERM, then re-raise so the process terminates.
  // installing a handler replaces the default (exit) behavior, so we must
  // explicitly kill ourselves after the flush has a chance to run.
  const handleSignal = (signal: "SIGINT" | "SIGTERM") => {
    const finish = () => {
      process.kill(process.pid, signal);
    };
    if (activeDrain) {
      activeDrain.flush().then(finish, finish);
    } else {
      finish();
    }
  };
  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
}

/** Flush any pending log events. Call before a controlled process.exit(). */
export async function flushLogs(): Promise<void> {
  if (activeDrain) await activeDrain.flush();
}

export function getLogFilePath(): string {
  return join(getCacheDir(), "logs");
}

// re-export evlog's log api so rest of the editor has a single import
export const log = evlog;
export { createError } from "evlog";
