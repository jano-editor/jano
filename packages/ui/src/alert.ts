import type { Screen } from "./screen.ts";
import type { Draw } from "./draw.ts";
import type { RGB } from "./color.ts";

export type AlertType = "info" | "success" | "warn" | "error";
export type AlertPosition = "top" | "bottom";

export interface AlertColors {
  fg?: RGB;
  bg?: RGB;
  border?: RGB;
}

export interface AlertOptions {
  message: string;
  type?: AlertType;
  position?: AlertPosition;
  width?: number;
  autoClose?: number; // ms, 0 / undefined = no auto-close
  colors?: AlertColors;
}

export interface AlertState {
  opts: AlertOptions;
  createdAt: number;
  closed: boolean;
  closeHitArea: { x: number; y: number; w: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const defaultColors: Record<AlertType, Required<AlertColors>> = {
  info: {
    fg: [220, 230, 240],
    bg: [40, 60, 90],
    border: [80, 140, 200],
  },
  success: {
    fg: [220, 245, 220],
    bg: [30, 70, 40],
    border: [80, 180, 100],
  },
  warn: {
    fg: [250, 240, 210],
    bg: [90, 70, 20],
    border: [220, 180, 60],
  },
  error: {
    fg: [250, 220, 220],
    bg: [90, 30, 30],
    border: [220, 80, 80],
  },
};

const icons: Record<AlertType, string> = {
  info: "i",
  success: "✓",
  warn: "!",
  error: "✗",
};

/**
 * Creates an alert. If autoClose is set, starts a timer that calls onClose after the given ms.
 * The caller should use onClose to clear its reference to the state and trigger a re-render.
 */
export function createAlert(opts: AlertOptions, onClose?: () => void): AlertState {
  const state: AlertState = {
    opts,
    createdAt: Date.now(),
    closed: false,
    closeHitArea: null,
    timer: null,
  };
  if (opts.autoClose && opts.autoClose > 0) {
    state.timer = setTimeout(() => {
      if (state.closed) return;
      state.closed = true;
      state.timer = null;
      onClose?.();
    }, opts.autoClose);
  }
  return state;
}

/**
 * Draws the alert. Returns the hit area for the close button so the caller can detect clicks.
 */
export function drawAlert(screen: Screen, draw: Draw, state: AlertState): void {
  if (state.closed) return;

  const opts = state.opts;
  const type = opts.type ?? "info";
  const position = opts.position ?? "top";
  const palette = defaultColors[type];
  const fg = opts.colors?.fg ?? palette.fg;
  const bg = opts.colors?.bg ?? palette.bg;
  const border = opts.colors?.border ?? palette.border;

  const width = Math.min(opts.width ?? 64, screen.width - 4);

  const iconStr = ` ${icons[type]} `;
  const closeStr = " ✕ ";
  const innerWidth = width - iconStr.length - closeStr.length;
  const msg =
    opts.message.length > innerWidth
      ? opts.message.substring(0, innerWidth - 1) + "…"
      : opts.message;

  const x = Math.floor((screen.width - width) / 2);
  const y = position === "top" ? 1 : screen.height - 2;

  let col = x;

  draw.text(col, y, iconStr, { fg, bg: border });
  col += iconStr.length;

  const padded = msg + " ".repeat(Math.max(0, innerWidth - msg.length));
  draw.text(col, y, padded, { fg, bg });
  col += padded.length;

  state.closeHitArea = { x: col, y, w: closeStr.length };
  draw.text(col, y, closeStr, { fg, bg: border });
}

/**
 * Returns true if a key event should close the alert (ESC).
 */
export function alertHandleKey(state: AlertState, keyRaw: Buffer): boolean {
  if (state.closed) return false;
  if (keyRaw.length === 1 && keyRaw[0] === 0x1b) {
    closeAlert(state);
    return true;
  }
  return false;
}

/**
 * Returns true if a click at (mouseX, mouseY) is on the close button.
 */
export function alertHandleClick(state: AlertState, mouseX: number, mouseY: number): boolean {
  if (state.closed || !state.closeHitArea) return false;
  const hit = state.closeHitArea;
  if (mouseY === hit.y && mouseX >= hit.x && mouseX < hit.x + hit.w) {
    closeAlert(state);
    return true;
  }
  return false;
}

export function closeAlert(state: AlertState): void {
  if (state.closed) return;
  state.closed = true;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}
