import type { Draw } from "./draw.ts";
import type { RGB } from "./color.ts";

export interface ProgressOptions {
  x: number;
  y: number;
  /** total columns of the bar */
  width: number;
  /** 0..1, clamped */
  value: number;
  fill?: RGB;
  empty?: RGB;
  bg?: RGB;
}

// eighth blocks, so the bar grows smoothly even when it is narrow
const PARTIAL = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** Draws a horizontal progress bar. */
export function drawProgress(draw: Draw, opts: ProgressOptions): void {
  const { x, y, width } = opts;
  if (width <= 0) return;
  const fill = opts.fill ?? [210, 80, 239];
  const empty = opts.empty ?? [60, 64, 72];
  const value = Number.isFinite(opts.value) ? Math.min(1, Math.max(0, opts.value)) : 0;

  const eighths = Math.round(value * width * 8);
  const full = Math.floor(eighths / 8);
  const partial = PARTIAL[eighths % 8];

  for (let i = 0; i < width; i++) {
    if (i < full) draw.char(x + i, y, "█", { fg: fill, bg: opts.bg });
    else if (i === full && partial) draw.char(x + i, y, partial, { fg: fill, bg: empty });
    else draw.char(x + i, y, " ", { bg: empty });
  }
}
