import type { Draw } from "./draw.ts";
import type { RGB } from "./color.ts";

export interface ToggleOptions {
  x: number;
  y: number;
  value: boolean;
  focused?: boolean;
  disabled?: boolean;
  bg?: RGB;
  onFg?: RGB;
  offFg?: RGB;
  focusedBg?: RGB;
  disabledFg?: RGB;
}

// fixed width: "[ON ]" / "[OFF]" = 5 cells
export const TOGGLE_WIDTH = 5;

export function drawToggle(draw: Draw, opts: ToggleOptions): void {
  const {
    x,
    y,
    value,
    focused = false,
    disabled = false,
    bg = [30, 33, 40],
    onFg = [120, 200, 130],
    offFg = [180, 100, 100],
    focusedBg = [60, 100, 180],
    disabledFg = [80, 85, 92],
  } = opts;

  const text = value ? "[ON ]" : "[OFF]";
  const rowBg = focused && !disabled ? focusedBg : bg;
  const fg = disabled ? disabledFg : value ? onFg : offFg;

  draw.text(x, y, text, { fg, bg: rowBg });
}
