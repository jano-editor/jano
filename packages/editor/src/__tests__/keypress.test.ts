import { describe, it, expect } from "bun:test";
import { parseKey, parseMouse } from "@jano-editor/ui";

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

  it("parses F9", () => {
    const key = parseKey(Buffer.from("\x1b[20~"));
    expect(key.name).toBe("f9");
  });
});

describe("parseMouse", () => {
  describe("SGR extended format", () => {
    it("parses left click (button 0 press)", () => {
      const event = parseMouse(Buffer.from("\x1b[<0;15;10M"));
      expect(event).toEqual({ type: "click", x: 14, y: 9 });
    });

    it("parses left click release", () => {
      const event = parseMouse(Buffer.from("\x1b[<0;15;10m"));
      expect(event).toEqual({ type: "release", x: 14, y: 9 });
    });

    it("parses drag (button 32)", () => {
      const event = parseMouse(Buffer.from("\x1b[<32;20;5M"));
      expect(event).toEqual({ type: "drag", x: 19, y: 4 });
    });

    it("parses scroll up (button 64)", () => {
      const event = parseMouse(Buffer.from("\x1b[<64;10;5M"));
      expect(event).toEqual({ type: "scroll-up", x: 9, y: 4 });
    });

    it("parses scroll down (button 65)", () => {
      const event = parseMouse(Buffer.from("\x1b[<65;10;5M"));
      expect(event).toEqual({ type: "scroll-down", x: 9, y: 4 });
    });

    it("parses shift+scroll up as scroll-left (button 68)", () => {
      const event = parseMouse(Buffer.from("\x1b[<68;10;5M"));
      expect(event).toEqual({ type: "scroll-left", x: 9, y: 4 });
    });

    it("parses shift+scroll down as scroll-right (button 69)", () => {
      const event = parseMouse(Buffer.from("\x1b[<69;10;5M"));
      expect(event).toEqual({ type: "scroll-right", x: 9, y: 4 });
    });

    it("parses ctrl+scroll up as scroll-left (button 80)", () => {
      const event = parseMouse(Buffer.from("\x1b[<80;10;5M"));
      expect(event).toEqual({ type: "scroll-left", x: 9, y: 4 });
    });

    it("parses ctrl+scroll down as scroll-right (button 81)", () => {
      const event = parseMouse(Buffer.from("\x1b[<81;10;5M"));
      expect(event).toEqual({ type: "scroll-right", x: 9, y: 4 });
    });

    it("converts 1-based coords to 0-based", () => {
      const event = parseMouse(Buffer.from("\x1b[<0;1;1M"));
      expect(event).toEqual({ type: "click", x: 0, y: 0 });
    });

    it("handles large coordinates", () => {
      const event = parseMouse(Buffer.from("\x1b[<0;200;50M"));
      expect(event).toEqual({ type: "click", x: 199, y: 49 });
    });

    it("returns null for unknown button", () => {
      const event = parseMouse(Buffer.from("\x1b[<99;10;5M"));
      expect(event).toBeNull();
    });

    it("returns null for right click (button 2)", () => {
      const event = parseMouse(Buffer.from("\x1b[<2;10;5M"));
      expect(event).toBeNull();
    });
  });

  describe("X10 format", () => {
    it("parses scroll up", () => {
      // button 64: Cb = 64+32 = 96, x=9(0-based): Cx = 9+33 = 42, y=4: Cy = 4+33 = 37
      const event = parseMouse(Buffer.from([0x1b, 0x5b, 0x4d, 96, 42, 37]));
      expect(event).toEqual({ type: "scroll-up", x: 9, y: 4 });
    });

    it("parses left click", () => {
      // button 0: Cb = 0+32 = 32, x=0: Cx = 0+33 = 33, y=0: Cy = 0+33 = 33
      const event = parseMouse(Buffer.from([0x1b, 0x5b, 0x4d, 32, 33, 33]));
      expect(event).toEqual({ type: "click", x: 0, y: 0 });
    });
  });

  describe("invalid input", () => {
    it("returns null for non-escape data", () => {
      expect(parseMouse(Buffer.from("hello"))).toBeNull();
    });

    it("returns null for keyboard escape sequences", () => {
      expect(parseMouse(Buffer.from("\x1b[A"))).toBeNull();
    });

    it("returns null for incomplete SGR sequence", () => {
      expect(parseMouse(Buffer.from("\x1b[<0;10"))).toBeNull();
    });

    it("returns null for NaN coordinates in SGR", () => {
      expect(parseMouse(Buffer.from("\x1b[<0;abc;5M"))).toBeNull();
    });

    it("returns null for negative X10 coordinates", () => {
      // Cx = 10 → x = 10-33 = -23 → rejected
      expect(parseMouse(Buffer.from([0x1b, 0x5b, 0x4d, 32, 10, 33]))).toBeNull();
    });
  });
});
