import { describe, it, expect } from "bun:test";
import { createDraw } from "../draw.ts";
import {
  createReveal,
  drawReveal,
  isRevealDone,
  revealDuration,
  revealFrame,
  revealSteps,
  revealWidth,
} from "../reveal.ts";
import type { Screen } from "../screen.ts";

const PINK = [210, 80, 239] as const;
const YELLOW = [230, 200, 100] as const;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

// renders one frame and returns the visible text (escape codes stripped)
function frame(text: string, step: number): string {
  let out = "";
  const screen = { width: 10, height: 1, write: (d: string) => (out += d) } as unknown as Screen;
  const draw = createDraw(screen);
  const state = createReveal(
    { text, enterColor: [...PINK], finalColor: [...YELLOW], stepMs: 10 },
    0,
  );
  drawReveal(draw, 0, 0, state, step * 10);
  draw.flush();
  return out.replace(ANSI, "").trimEnd();
}

describe("reveal", () => {
  it("writes the text out of a block cursor, then blinks and settles", () => {
    const frames = Array.from({ length: 9 }, (_, step) => frame("jan", step));
    expect(frames).toEqual([
      "█", // cursor alone
      "J█", // J enters uppercased
      "jA█", // J settled, A enters
      "jaN█",
      "jan█", // all settled
      "jan", // blink off
      "jan█", // blink on
      "jan", // blink off
      "jan", // done
    ]);
  });

  it("keeps graphemes whose uppercase form is wider (ß -> SS)", () => {
    expect(frame("aßb", 2)).toBe("aß█");
    expect(frame("aßb", 3)).toBe("aßB█");
  });

  it("uses the enter color for the entering grapheme only", () => {
    let out = "";
    const screen = { width: 10, height: 1, write: (d: string) => (out += d) } as unknown as Screen;
    const draw = createDraw(screen);
    const state = createReveal({ text: "ab", enterColor: [1, 2, 3], finalColor: [4, 5, 6] }, 0);
    drawReveal(draw, 0, 0, state, state.opts.stepMs * 2);
    draw.flush();
    expect(out).toContain("38;2;4;5;6ma"); // settled a in final color
    expect(out).toContain("38;2;1;2;3mB"); // entering B in enter color
  });

  it("reports width and completion", () => {
    const state = createReveal(
      { text: "jano", enterColor: [0, 0, 0], finalColor: [0, 0, 0], stepMs: 100, blinkMs: 250 },
      0,
    );
    expect(revealWidth(state)).toBe(5);
    expect(revealSteps(state)).toBe(9);
    // 5 typing frames at 100ms, then 4 blink phases at 250ms
    expect(revealDuration(state)).toBe(1500);
    expect(isRevealDone(state, 1499)).toBe(false);
    expect(isRevealDone(state, 1500)).toBe(true);
  });

  it("frames advance with the typing speed first, then the blink speed", () => {
    const state = createReveal(
      { text: "ab", enterColor: [0, 0, 0], finalColor: [0, 0, 0], stepMs: 100, blinkMs: 250 },
      0,
    );
    expect([0, 99, 100, 299, 300, 549, 550].map((t) => revealFrame(state, t))).toEqual([
      0, 0, 1, 2, 3, 3, 4,
    ]);
  });
});
