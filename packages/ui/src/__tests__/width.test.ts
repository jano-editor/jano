import { describe, it, expect } from "bun:test";
import { graphemeWidth, stringWidth } from "../width.ts";

describe("graphemeWidth", () => {
  it("keeps narrow text symbols at one column", () => {
    expect(graphemeWidth("❤")).toBe(1);
    expect(graphemeWidth("✓")).toBe(1);
    expect(graphemeWidth("♥︎")).toBe(1); // explicit text presentation
  });

  it("widens emoji presentation sequences (VS16)", () => {
    expect(graphemeWidth("❤️")).toBe(2);
    expect(graphemeWidth("⚠️")).toBe(2);
    expect(graphemeWidth("1️⃣")).toBe(2);
  });

  it("keeps an ascii letter with VS16 narrow", () => {
    expect(graphemeWidth("a️")).toBe(1);
  });

  it("handles wide emoji, flags and zwj sequences", () => {
    expect(graphemeWidth("😀")).toBe(2);
    expect(graphemeWidth("🇩🇪")).toBe(2);
    expect(graphemeWidth("👨‍👩‍👧")).toBe(2);
  });

  it("stringWidth sums the clusters", () => {
    expect(stringWidth("asd❤️asdf")).toBe(9);
  });
});
