import { describe, it, expect } from "bun:test";
import { createDraw } from "../draw.ts";
import { drawProgress } from "../progress.ts";
import type { Screen } from "../screen.ts";

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

function bar(value: number, width = 4): string {
  let out = "";
  const screen = { width, height: 1, write: (d: string) => (out += d) } as unknown as Screen;
  const draw = createDraw(screen);
  drawProgress(draw, { x: 0, y: 0, width, value });
  draw.flush();
  return out.replace(ANSI, "");
}

describe("drawProgress", () => {
  it("fills proportionally", () => {
    expect(bar(0)).toBe("    ");
    expect(bar(0.5)).toBe("██  ");
    expect(bar(1)).toBe("████");
  });

  it("uses eighth blocks for partial cells", () => {
    expect(bar(0.5 / 4)).toBe("▌   "); // half of the first cell
  });

  it("clamps out of range values", () => {
    expect(bar(-1)).toBe("    ");
    expect(bar(5)).toBe("████");
    expect(bar(Number.NaN)).toBe("    ");
  });
});
