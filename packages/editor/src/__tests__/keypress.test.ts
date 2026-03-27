import { describe, it, expect } from "vitest";
import { parseKey } from "../keypress.ts";

describe("parseKey", () => {
  it("parses regular characters", () => {
    const key = parseKey(Buffer.from("a"));
    expect(key.name).toBe("a");
    expect(key.ctrl).toBe(false);
    expect(key.shift).toBe(false);
  });

  it("parses enter before ctrl check (byte 13 = ctrl+m)", () => {
    const key = parseKey(Buffer.from([13]));
    expect(key.name).toBe("enter");
    expect(key.ctrl).toBe(false);
  });

  it("parses tab before ctrl check (byte 9 = ctrl+i)", () => {
    const key = parseKey(Buffer.from([9]));
    expect(key.name).toBe("tab");
    expect(key.ctrl).toBe(false);
  });

  it("parses ctrl+backspace (0x08) before ctrl+h", () => {
    const key = parseKey(Buffer.from([0x08]));
    expect(key.name).toBe("backspace");
    expect(key.ctrl).toBe(true);
  });

  it("parses ctrl+letter", () => {
    // ctrl+s = byte 19
    const key = parseKey(Buffer.from([19]));
    expect(key.name).toBe("s");
    expect(key.ctrl).toBe(true);
  });

  it("parses backspace (127) as non-ctrl", () => {
    const key = parseKey(Buffer.from([127]));
    expect(key.name).toBe("backspace");
    expect(key.ctrl).toBe(false);
  });

  it("parses escape alone (length 1)", () => {
    const key = parseKey(Buffer.from([0x1b]));
    // escape is handled by raw byte check in input.ts, parser returns empty name
    expect(key.raw[0]).toBe(0x1b);
    expect(key.raw.length).toBe(1);
  });

  it("parses shift+ctrl+right (1;6C)", () => {
    const key = parseKey(Buffer.from("\x1b[1;6C"));
    expect(key.name).toBe("right");
    expect(key.ctrl).toBe(true);
    expect(key.shift).toBe(true);
  });

  it("parses alt+up (1;3A)", () => {
    const key = parseKey(Buffer.from("\x1b[1;3A"));
    expect(key.name).toBe("up");
    expect(key.alt).toBe(true);
    expect(key.ctrl).toBe(false);
  });

  it("parses F2 and F3", () => {
    const f2 = parseKey(Buffer.from([0x1b, 0x4f, 0x51]));
    expect(f2.name).toBe("f2");

    const f3 = parseKey(Buffer.from([0x1b, 0x4f, 0x52]));
    expect(f3.name).toBe("f3");
  });

  it("parses ctrl+delete (3;5~)", () => {
    const key = parseKey(Buffer.from("\x1b[3;5~"));
    expect(key.name).toBe("delete");
    expect(key.ctrl).toBe(true);
  });

  it("parses UTF-8 multi-byte characters", () => {
    const key = parseKey(Buffer.from("ü"));
    expect(key.name).toBe("ü");
    expect(key.ctrl).toBe(false);
  });
});
