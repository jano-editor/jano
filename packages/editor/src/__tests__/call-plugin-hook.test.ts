import { describe, it, expect, mock, beforeEach } from "bun:test";

// mock the logger module BEFORE importing callPluginHook, so it picks up the stub
const logCalls: { level: string; event: Record<string, unknown> }[] = [];

void mock.module("../utils/logger.ts", () => ({
  isDebug: true,
  log: {
    debug: (event: Record<string, unknown>) => logCalls.push({ level: "debug", event }),
    info: (event: Record<string, unknown>) => logCalls.push({ level: "info", event }),
    warn: (event: Record<string, unknown>) => logCalls.push({ level: "warn", event }),
    error: (event: Record<string, unknown>) => logCalls.push({ level: "error", event }),
  },
  initDebugLogger: () => {},
  flushLogs: async () => {},
  getLogFilePath: () => "/tmp/jano-test",
  createError: (o: unknown) => o,
}));

const { callPluginHook } = await import("../plugins/call.ts");

describe("callPluginHook", () => {
  beforeEach(() => {
    logCalls.length = 0;
  });

  describe("error handling", () => {
    it("returns null when the plugin throws", () => {
      const plugin = { name: "yaml" };
      const result = callPluginHook(plugin, "onFormat", () => {
        throw new Error("kaboom");
      });
      expect(result).toBeNull();
    });

    it("does not let the exception propagate", () => {
      const plugin = { name: "yaml" };
      expect(() => {
        callPluginHook(plugin, "onFormat", () => {
          throw new Error("kaboom");
        });
      }).not.toThrow();
    });

    it("logs plugin_hook_failed with error, stack, and duration on crash", () => {
      const plugin = { name: "yaml" };
      callPluginHook(plugin, "onCursorAction", () => {
        throw new Error("kaboom");
      });

      expect(logCalls).toHaveLength(1);
      const entry = logCalls[0]!;
      expect(entry.level).toBe("error");
      expect(entry.event.action).toBe("plugin_hook_failed");
      expect(entry.event.plugin).toBe("yaml");
      expect(entry.event.hook).toBe("onCursorAction");
      expect(entry.event.error).toBe("kaboom");
      expect(typeof entry.event.stack).toBe("string");
      expect(typeof entry.event.durationMs).toBe("number");
    });

    it("handles non-Error throws (string, undefined)", () => {
      const plugin = { name: "yaml" };
      callPluginHook(plugin, "onFormat", () => {
        throw "oops";
      });
      expect(logCalls).toHaveLength(1);
      expect(logCalls[0]!.event.error).toBe("oops");
      expect(logCalls[0]!.event.stack).toBeUndefined();
    });
  });

  describe("success handling", () => {
    it("returns the plugin result when defined", () => {
      const plugin = { name: "yaml" };
      const edit = { edits: [], cursors: [] };
      const result = callPluginHook(plugin, "onFormat", () => edit);
      expect(result).toBe(edit);
    });

    it("returns null when the plugin returns null", () => {
      const plugin = { name: "yaml" };
      const result = callPluginHook(plugin, "onFormat", () => null);
      expect(result).toBeNull();
    });

    it("logs plugin_hook_result when the plugin returns an edit", () => {
      const plugin = { name: "markdown" };
      callPluginHook(plugin, "onCursorAction", () => ({ edits: [] }));

      expect(logCalls).toHaveLength(1);
      expect(logCalls[0]!.level).toBe("debug");
      expect(logCalls[0]!.event.action).toBe("plugin_hook_result");
      expect(logCalls[0]!.event.plugin).toBe("markdown");
      expect(logCalls[0]!.event.hook).toBe("onCursorAction");
    });

    it("is silent when the plugin returns null and is fast (no keystroke spam)", () => {
      const plugin = { name: "markdown" };
      callPluginHook(plugin, "onCursorAction", () => null);
      callPluginHook(plugin, "onCursorAction", () => undefined);
      callPluginHook(plugin, "onCursorAction", () => null);

      expect(logCalls).toHaveLength(0);
    });

    it("logs plugin_hook_slow when the plugin is slow even without a result", async () => {
      const plugin = { name: "yaml" };
      // busy-wait to be reliably slow without introducing flaky setTimeout timing
      callPluginHook(plugin, "onValidate", () => {
        const start = Date.now();
        while (Date.now() - start < 10) {
          // burn CPU for 10ms
        }
        return null;
      });

      expect(logCalls).toHaveLength(1);
      expect(logCalls[0]!.event.action).toBe("plugin_hook_slow");
      expect(logCalls[0]!.event.plugin).toBe("yaml");
      expect(logCalls[0]!.event.hook).toBe("onValidate");
      expect(logCalls[0]!.event.durationMs).toBeGreaterThanOrEqual(5);
    });
  });
});
