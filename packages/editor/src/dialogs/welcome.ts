import { drawProgress, type RGB } from "@jano-editor/ui";
import { installPlugin, type RegistryPlugin } from "../plugins/registry.ts";
import { markSeen } from "../plugins/recommendations.ts";
import { updateEditorSetting } from "../settings.ts";
import { log } from "../utils/logger.ts";
import type { Session } from "./session.ts";

// Offers the registry's plugins on startup. Most people never find out jano has plugins,
// and without them files open without any highlighting.

const BORDER: RGB = [80, 90, 105];
const FILL: RGB = [30, 33, 40];
const TEXT: RGB = [171, 178, 191];
const MUTED: RGB = [100, 105, 115];
const HINT: RGB = [70, 75, 85];
const TITLE: RGB = [230, 200, 100];
const SELECTED_BG: RGB = [60, 100, 180];
const OK: RGB = [120, 200, 120];
const ERR: RGB = [230, 100, 100];
const BUSY: RGB = [210, 80, 239];

type Status = "pending" | "busy" | "ok" | "failed";

interface Row {
  plugin: RegistryPlugin;
  checked: boolean;
  status: Status;
  error?: string;
}

/**
 * Shows the recommendations, installs the picked plugins with a progress bar and calls
 * onInstalled so the editor can load them right away.
 */
export function showPluginWelcome(
  s: Session,
  plugins: RegistryPlugin[],
  onInstalled: () => Promise<void>,
): Promise<void> {
  return new Promise((resolve) => {
    const rows: Row[] = plugins.map((plugin) => ({ plugin, checked: true, status: "pending" }));
    let phase: "pick" | "install" | "done" = "pick";
    let selected = 0;
    let backgroundDrawn = false;

    const dialogW = Math.min(68, s.screen.width - 4);
    const listH = Math.max(1, Math.min(rows.length, s.screen.height - 12));
    const nameW = Math.max(...rows.map((r) => r.plugin.name.length));

    function render() {
      if (!backgroundDrawn) {
        // set first: the background render paints open layers, including this dialog
        backgroundDrawn = true;
        s.update();
      }
      // intro, blank, list, blank, progress or hint lines, borders
      const totalH = 4 + listH + 4;
      const x = Math.floor((s.screen.width - dialogW) / 2);
      const y = Math.max(1, Math.floor((s.screen.height - totalH) / 2));
      const inner = dialogW - 4;

      s.draw.rect(x, y, dialogW, totalH, { fg: BORDER, border: "round", fill: FILL });
      const title = " Welcome to jano ";
      s.draw.text(x + Math.floor((dialogW - title.length) / 2), y, title, { fg: TITLE });
      s.draw.text(x + 2, y + 1, "Plugins add highlighting, formatting and validation.", {
        fg: TEXT,
        bg: FILL,
      });
      s.draw.text(x + 2, y + 2, "Recommended plugins:", { fg: MUTED, bg: FILL });

      const scroll = Math.max(0, Math.min(selected - listH + 1, rows.length - listH));
      for (let i = 0; i < listH; i++) {
        const row = rows[i + scroll];
        if (!row) break;
        const rowY = y + 4 + i;
        const isSelected = phase === "pick" && i + scroll === selected;
        const bg = isSelected ? SELECTED_BG : FILL;
        s.draw.text(x + 1, rowY, " ".repeat(dialogW - 2), { bg });

        const { mark, color } = marker(row);
        s.draw.text(x + 2, rowY, mark, { fg: isSelected ? [255, 255, 255] : color, bg });
        s.draw.text(x + 6, rowY, row.plugin.name.padEnd(nameW), {
          fg: isSelected ? [255, 255, 255] : TEXT,
          bg,
        });
        const detail = row.status === "failed" ? (row.error ?? "failed") : row.plugin.description;
        const detailW = Math.max(0, inner - 6 - nameW);
        const clipped = detail.length > detailW ? detail.slice(0, detailW - 1) + "…" : detail;
        s.draw.text(x + 8 + nameW, rowY, clipped, {
          fg: isSelected ? [255, 255, 255] : row.status === "failed" ? ERR : MUTED,
          bg,
        });
      }

      const footY = y + 5 + listH;
      if (phase === "pick") {
        s.draw.text(x + 2, footY, "↑↓ Move  Space Toggle  Enter Install  Esc Later", {
          fg: HINT,
          bg: FILL,
        });
        s.draw.text(x + 2, footY + 1, "N Don't show again (F9 turns it back on)", {
          fg: HINT,
          bg: FILL,
        });
      } else {
        const picked = rows.filter((r) => r.checked);
        const finished = picked.filter((r) => r.status === "ok" || r.status === "failed").length;
        const counter = ` ${finished}/${picked.length}`;
        drawProgress(s.draw, {
          x: x + 2,
          y: footY,
          width: inner - counter.length,
          value: picked.length ? finished / picked.length : 1,
          bg: FILL,
        });
        s.draw.text(x + 2 + inner - counter.length, footY, counter, { fg: TEXT, bg: FILL });
        const failed = picked.filter((r) => r.status === "failed").length;
        const status =
          phase === "install"
            ? "Installing..."
            : failed > 0
              ? `${finished - failed} installed, ${failed} failed. Enter Close`
              : "All set, plugins are active now. Enter Close";
        s.draw.text(x + 2, footY + 1, status.padEnd(inner), {
          fg: failed > 0 && phase === "done" ? ERR : HINT,
          bg: FILL,
        });
      }

      s.screen.hideCursor();
      s.draw.flush();
    }

    function marker(row: Row): { mark: string; color: RGB } {
      if (phase === "pick") return { mark: row.checked ? "[x]" : "[ ]", color: TEXT };
      if (!row.checked) return { mark: " · ", color: HINT };
      switch (row.status) {
        case "busy":
          return { mark: " … ", color: BUSY };
        case "ok":
          return { mark: " ✓ ", color: OK };
        case "failed":
          return { mark: " ✗ ", color: ERR };
        default:
          return { mark: " · ", color: MUTED };
      }
    }

    function close() {
      s.input.popLayer(layer);
      s.update();
      resolve();
    }

    async function install() {
      phase = "install";
      // the user decided on every offered plugin, deselected ones won't be offered again
      markSeen(rows.map((r) => r.plugin.name));
      const picked = rows.filter((r) => r.checked);
      log.info({ action: "plugin_welcome_install", plugins: picked.map((r) => r.plugin.name) });
      for (const row of picked) {
        row.status = "busy";
        render();
        // no console output inside the editor, it would break the screen
        const result = await installPlugin(row.plugin.name, () => {});
        row.status = result.success ? "ok" : "failed";
        row.error = result.error;
        log.info({
          action: result.success ? "plugin_welcome_installed" : "plugin_welcome_install_failed",
          plugin: row.plugin.name,
          error: result.success ? undefined : result.error,
        });
        render();
      }
      if (picked.some((r) => r.status === "ok")) await onInstalled();
      phase = "done";
      render();
    }

    const layer = s.input.pushLayer("welcome", render);
    layer.on("key", (key) => {
      if (phase === "install") return true;
      if (phase === "done") {
        if (key.name === "enter" || (key.raw.length === 1 && key.raw[0] === 0x1b)) close();
        return true;
      }

      if (key.raw.length === 1 && key.raw[0] === 0x1b) {
        log.info({ action: "plugin_welcome_later" });
        close();
      } else if (key.name === "n" || key.name === "N") {
        updateEditorSetting("pluginRecommendations", false);
        log.info({ action: "plugin_welcome_disabled" });
        close();
      } else if (key.name === "up") {
        selected = Math.max(0, selected - 1);
        render();
      } else if (key.name === "down") {
        selected = Math.min(rows.length - 1, selected + 1);
        render();
      } else if (key.name === " ") {
        rows[selected].checked = !rows[selected].checked;
        render();
      } else if (key.name === "enter") {
        if (rows.some((r) => r.checked)) void install();
        else close();
      }
      return true;
    });

    // block all other events while open
    layer.on("mouse:click", () => true);
    layer.on("mouse:drag", () => true);
    layer.on("mouse:release", () => true);
    layer.on("mouse:scroll", () => true);
    layer.on("paste", () => true);

    log.info({ action: "plugin_welcome_shown", plugins: plugins.map((p) => p.name) });
    render();
  });
}
