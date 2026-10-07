import { describe, it, expect } from "bun:test";
import { createDraw } from "../draw.ts";
import type { Screen } from "../screen.ts";

function capture(width: number) {
  let out = "";
  const screen = { width, height: 1, write: (d: string) => (out += d) } as unknown as Screen;
  const output = () =>
    out.replaceAll("\x1b[0m", "").replaceAll("\x1b[?2026h", "").replaceAll("\x1b[?2026l", "");
  return { draw: createDraw(screen), output, raw: () => out };
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

  it("wraps every frame in synchronized output", () => {
    const { draw, raw } = capture(3);
    draw.text(0, 0, "abc");
    draw.flush();
    expect(raw().startsWith("\x1b[?2026h")).toBe(true);
    expect(raw().endsWith("\x1b[?2026l")).toBe(true);
  });

  it("flushRows writes only those rows and keeps the cursor in place", () => {
    let out = "";
    const screen = { width: 3, height: 3, write: (d: string) => (out += d) } as unknown as Screen;
    const draw = createDraw(screen);
    draw.text(0, 0, "top");
    draw.text(0, 2, "low");
    draw.flushRows([0]);
    expect(out).toContain("top");
    expect(out).not.toContain("low");
    expect(out).not.toContain("\x1b[2;1H");
    // save cursor before, restore after
    expect(out.indexOf("\x1b7")).toBeLessThan(out.indexOf("top"));
    expect(out.indexOf("\x1b8")).toBeGreaterThan(out.indexOf("top"));
  });

  it("adds nothing for narrow text", () => {
    const { draw, output } = capture(3);
    draw.text(0, 0, "abc");
    draw.flush();
    expect(output()).toBe("\x1b[1;1Habc");
  });
});
