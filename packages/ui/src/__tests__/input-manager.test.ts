import { describe, it, expect, beforeEach } from "bun:test";
import { createInputManager, parseKey, keyToCombo, type InputManager } from "../input-manager.ts";

describe("InputManager", () => {
  let mgr: InputManager;

  beforeEach(() => {
    mgr = createInputManager();
  });

  describe("layers", () => {
    it("pushLayer creates a named layer", () => {
      const layer = mgr.pushLayer("test");
      expect(layer.name).toBe("test");
    });

    it("popLayer removes the layer without error", () => {
      const layer = mgr.pushLayer("test");
      mgr.popLayer(layer);
    });

    it("popLayer on unknown layer is a no-op", () => {
      const layer = mgr.pushLayer("test");
      mgr.popLayer(layer);
      mgr.popLayer(layer); // second pop does nothing
    });

    it("supports multiple layers with different names", () => {
      const l1 = mgr.pushLayer("editor");
      const l2 = mgr.pushLayer("dialog");
      const l3 = mgr.pushLayer("popup");
      expect(l1.name).toBe("editor");
      expect(l2.name).toBe("dialog");
      expect(l3.name).toBe("popup");
    });

    it("on/off registers and removes handlers", () => {
      const layer = mgr.pushLayer("test");
      const handler = () => true;
      layer.on("key", handler);
      layer.off("key", handler);
    });

    it("off on unregistered handler is a no-op", () => {
      const layer = mgr.pushLayer("test");
      layer.off("key", () => true); // never registered
    });
  });

  describe("shortcuts", () => {
    it("registerShortcut and unregisterShortcut", () => {
      mgr.registerShortcut("ctrl+s", "save");
      mgr.unregisterShortcut("ctrl+s");
    });

    it("shortcuts are case-insensitive", () => {
      mgr.registerShortcut("Ctrl+S", "save");
      mgr.unregisterShortcut("ctrl+s");
    });

    it("can register multiple shortcuts", () => {
      mgr.registerShortcut("ctrl+s", "save");
      mgr.registerShortcut("ctrl+q", "exit");
      mgr.registerShortcut("f1", "help");
      mgr.registerShortcut("ctrl+shift+up", "multi-cursor");
    });

    it("overwriting a shortcut replaces the action", () => {
      mgr.registerShortcut("ctrl+s", "save");
      mgr.registerShortcut("ctrl+s", "save-as");
      // no error, last registration wins
    });
  });
});

describe("keyToCombo", () => {
  it("simple key", () => {
    expect(
      keyToCombo({ name: "a", ctrl: false, shift: false, alt: false, raw: Buffer.from("a") }),
    ).toBe("a");
  });

  it("ctrl+key", () => {
    const key = parseKey(Buffer.from([19])); // ctrl+s = byte 19
    expect(keyToCombo(key)).toBe("ctrl+s");
  });

  it("alt+key", () => {
    const key = parseKey(Buffer.from([0x1b, 0x6e])); // alt+n
    expect(keyToCombo(key)).toBe("alt+n");
  });

  it("shift+arrow", () => {
    const key = parseKey(Buffer.from("\x1b[1;2A")); // shift+up
    expect(keyToCombo(key)).toBe("shift+up");
  });

  it("ctrl+shift+arrow", () => {
    const key = parseKey(Buffer.from("\x1b[1;6C")); // ctrl+shift+right
    expect(keyToCombo(key)).toBe("ctrl+shift+right");
  });

  it("ctrl+alt+arrow", () => {
    const key = parseKey(Buffer.from("\x1b[1;7A")); // ctrl+alt+up
    expect(keyToCombo(key)).toBe("ctrl+alt+up");
  });

  it("function key", () => {
    const key = parseKey(Buffer.from([0x1b, 0x4f, 0x50])); // f1
    expect(keyToCombo(key)).toBe("f1");
  });

  it("f9", () => {
    const key = parseKey(Buffer.from("\x1b[20~")); // f9
    expect(keyToCombo(key)).toBe("f9");
  });

  it("enter", () => {
    const key = parseKey(Buffer.from([13]));
    expect(keyToCombo(key)).toBe("enter");
  });

  it("backspace", () => {
    const key = parseKey(Buffer.from([127]));
    expect(keyToCombo(key)).toBe("backspace");
  });

  it("ctrl+backspace", () => {
    const key = parseKey(Buffer.from([0x08]));
    expect(keyToCombo(key)).toBe("ctrl+backspace");
  });

  it("combo matches registered shortcut format", () => {
    // verify that parseKey output produces combos that match registerShortcut format
    const ctrlS = parseKey(Buffer.from([19]));
    expect(keyToCombo(ctrlS)).toBe("ctrl+s");

    const f1 = parseKey(Buffer.from([0x1b, 0x4f, 0x50]));
    expect(keyToCombo(f1)).toBe("f1");

    const ctrlQ = parseKey(Buffer.from([17]));
    expect(keyToCombo(ctrlQ)).toBe("ctrl+q");
  });
});
