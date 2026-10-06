import { describe, it, expect } from "bun:test";
import { createDraw } from "../draw.ts";
import type { Screen } from "../screen.ts";

function capture(width: number) {
  let out = "";
  const screen = { width, height: 1, write: (d: string) => (out += d) } as unknown as Screen;
  return { draw: createDraw(screen), output: () => out.replaceAll("\x1b[0m", "") };
}

describe("flush", () => {
  it("repositions after a wide glyph instead of trusting the terminal advance", () => {
    const { draw, output } = capture(6);
    draw.text(0, 0, "a❤️b");
    draw.flush();
    // right half painted first, then the glyph, then an explicit jump to the next cell
    expect(output()).toBe("\x1b[1;1Ha\x1b[3G \x1b[2G❤️\x1b[4Gb  ");
  });

  it("blanks the left half when an overlay covers the right half", () => {
    const { draw, output } = capture(5);
    draw.text(0, 0, "a😀b");
    draw.char(2, 0, "│");
    draw.flush();
    expect(output()).toBe("\x1b[1;1Ha │b ");
  });

  it("blanks the right half when an overlay covers the left half", () => {
    const { draw, output } = capture(5);
    draw.text(0, 0, "a😀b");
    draw.char(1, 0, "│");
    draw.flush();
    expect(output()).toBe("\x1b[1;1Ha│ b ");
  });

  it("redrawing a wide glyph over another stays consistent", () => {
    const { draw, output } = capture(4);
    draw.text(0, 0, "😀😀");
    draw.text(1, 0, "😀");
    draw.flush();
    expect(output()).toBe("\x1b[1;1H \x1b[3G \x1b[2G😀\x1b[4G ");
  });

  it("adds nothing for narrow text", () => {
    const { draw, output } = capture(3);
    draw.text(0, 0, "abc");
    draw.flush();
    expect(output()).toBe("\x1b[1;1Habc");
  });
});
