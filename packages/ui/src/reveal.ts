import type { Draw } from "./draw.ts";
import type { RGB } from "./color.ts";
import { graphemes, graphemeWidth } from "./width.ts";

// Typewriter style reveal: a block cursor writes the text one grapheme at a time.
// Each grapheme enters in `enterColor` (uppercased by default) and settles into
// `finalColor` once the next one appears. After the last one the cursor blinks
// a few times and disappears. Time based, so callers just redraw on a timer.

export interface RevealOptions {
  text: string;
  enterColor: RGB;
  finalColor: RGB;
  /** block cursor color, defaults to enterColor */
  cursorColor?: RGB;
  bg?: RGB;
  /** ms per typed grapheme, default 130 */
  stepMs?: number;
  /** ms per cursor blink phase (on or off), defaults to stepMs */
  blinkMs?: number;
  /** cursor blinks after the text is complete, default 2 */
  blinks?: number;
  /** show entering graphemes uppercased, default true */
  uppercaseOnEnter?: boolean;
}

export interface RevealState {
  opts: Required<Omit<RevealOptions, "cursorColor" | "bg">> & Pick<RevealOptions, "bg">;
  cursorColor: RGB;
  chars: string[];
  startedAt: number;
}

const CURSOR = "█";

export function createReveal(opts: RevealOptions, now = Date.now()): RevealState {
  return {
    opts: {
      text: opts.text,
      enterColor: opts.enterColor,
      finalColor: opts.finalColor,
      bg: opts.bg,
      stepMs: opts.stepMs ?? 130,
      blinkMs: opts.blinkMs ?? opts.stepMs ?? 130,
      blinks: opts.blinks ?? 2,
      uppercaseOnEnter: opts.uppercaseOnEnter ?? true,
    },
    cursorColor: opts.cursorColor ?? opts.enterColor,
    chars: graphemes(opts.text),
    startedAt: now,
  };
}

/** Columns the reveal occupies: the text plus one cell for the cursor. */
export function revealWidth(state: RevealState): number {
  return state.chars.reduce((w, g) => w + graphemeWidth(g), 0) + 1;
}

/** Total frames until done: cursor alone, one per grapheme, then on/off per blink. */
export function revealSteps(state: RevealState): number {
  return state.chars.length + 1 + state.opts.blinks * 2;
}

/** Total duration in ms. */
export function revealDuration(state: RevealState): number {
  const { stepMs, blinkMs, blinks } = state.opts;
  return (state.chars.length + 1) * stepMs + blinks * 2 * blinkMs;
}

/** Frame number at `now`. It only changes when the picture does, so callers can skip redraws. */
export function revealFrame(state: RevealState, now = Date.now()): number {
  const { stepMs, blinkMs } = state.opts;
  const t = Math.max(0, now - state.startedAt);
  const typing = (state.chars.length + 1) * stepMs;
  if (t < typing) return Math.floor(t / stepMs);
  return state.chars.length + 1 + Math.floor((t - typing) / blinkMs);
}

export function isRevealDone(state: RevealState, now = Date.now()): boolean {
  return now - state.startedAt >= revealDuration(state);
}

/** Draws the current frame at (x, y). Unrevealed cells are drawn as spaces. */
export function drawReveal(draw: Draw, x: number, y: number, state: RevealState, now = Date.now()) {
  const { chars, opts } = state;
  const n = chars.length;
  const step = revealFrame(state, now);
  const done = step >= revealSteps(state);

  // step k (1..n): graphemes 0..k-2 settled, k-1 entering, cursor behind it
  const shown = done ? n : Math.min(step, n);
  const entering = !done && step >= 1 && step <= n ? step - 1 : -1;
  // after the text is complete the cursor blinks: visible on even steps, hidden on odd ones
  const cursorVisible = !done && (step <= n || (step - n - 1) % 2 === 0);

  let col = x;
  let cursorCol = x;
  for (let i = 0; i < n; i++) {
    const g = chars[i];
    const w = graphemeWidth(g);
    if (i < shown) {
      const isEntering = i === entering;
      const text = isEntering && opts.uppercaseOnEnter ? g.toUpperCase() : g;
      draw.text(col, y, text, { fg: isEntering ? opts.enterColor : opts.finalColor, bg: opts.bg });
    } else {
      draw.text(col, y, " ".repeat(w), { bg: opts.bg });
    }
    col += w;
    if (i === shown - 1) cursorCol = col;
  }
  // the extra cell the cursor rests on at the end
  draw.text(col, y, " ", { bg: opts.bg });
  // drawn last so unrevealed cells can't cover it
  if (cursorVisible) draw.text(cursorCol, y, CURSOR, { fg: state.cursorColor, bg: opts.bg });
}
