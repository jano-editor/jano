// ----- Event Types -----

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  raw: Buffer;
}

export interface MouseEvent {
  type: "click" | "release" | "drag" | "scroll-up" | "scroll-down" | "scroll-left" | "scroll-right";
  x: number;
  y: number;
}

export interface PasteEvent {
  text: string;
}

export interface ShortcutEvent {
  action: string;
  key: KeyEvent;
}

export type InputEventMap = {
  key: KeyEvent;
  shortcut: ShortcutEvent;
  "mouse:click": MouseEvent;
  "mouse:release": MouseEvent;
  "mouse:drag": MouseEvent;
  "mouse:scroll": MouseEvent;
  paste: PasteEvent;
  "focus:in": void;
  "focus:out": void;
  resize: void;
};

export type InputEventName = keyof InputEventMap;
export type InputHandler<E extends InputEventName> = (event: InputEventMap[E]) => boolean | void;

// ----- Layer -----

export interface InputLayer {
  readonly name: string;
  on<E extends InputEventName>(event: E, handler: InputHandler<E>): void;
  off<E extends InputEventName>(event: E, handler: InputHandler<E>): void;
}

interface LayerInternal extends InputLayer {
  handlers: Map<InputEventName, Set<InputHandler<any>>>;
}

function createLayer(name: string): LayerInternal {
  const handlers = new Map<InputEventName, Set<InputHandler<any>>>();

  return {
    name,
    handlers,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
  };
}

// ----- Mouse Parsing -----

function mouseFromButton(
  button: number,
  x: number,
  y: number,
  pressed: boolean,
): MouseEvent | null {
  switch (button) {
    case 0:
      return { type: pressed ? "click" : "release", x, y };
    case 32:
      return { type: "drag", x, y };
    case 64:
      return { type: "scroll-up", x, y };
    case 65:
      return { type: "scroll-down", x, y };
    case 68:
      return { type: "scroll-left", x, y };
    case 69:
      return { type: "scroll-right", x, y };
    case 80:
      return { type: "scroll-left", x, y };
    case 81:
      return { type: "scroll-right", x, y };
    default:
      return null;
  }
}

export function parseMouse(data: Buffer): MouseEvent | null {
  if (data[0] !== 0x1b || data[1] !== 0x5b) return null;

  // SGR extended: ESC [ < button ; x ; y M/m
  if (data[2] === 0x3c) {
    const last = data[data.length - 1];
    if (last !== 0x4d && last !== 0x6d) return null;
    const pressed = last === 0x4d;
    const params = data.toString("utf8", 3, data.length - 1);
    const parts = params.split(";");
    if (parts.length !== 3) return null;
    const button = parseInt(parts[0], 10);
    const x = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10) - 1;
    if (!Number.isFinite(button) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || y < 0) return null;
    return mouseFromButton(button, x, y, pressed);
  }

  // X10: ESC [ M Cb Cx Cy
  if (data[2] === 0x4d && data.length === 6) {
    const button = data[3] - 32;
    const x = data[4] - 33;
    const y = data[5] - 33;
    if (button < 0 || x < 0 || y < 0) return null;
    return mouseFromButton(button, x, y, true);
  }

  return null;
}

// ----- Key Parsing -----

export function parseKey(data: Buffer): KeyEvent {
  const key: KeyEvent = { name: "", ctrl: false, shift: false, alt: false, raw: data };

  if (data.length === 1 && data[0] === 13) {
    key.name = "enter";
    return key;
  }
  if (data.length === 1 && data[0] === 9) {
    key.name = "tab";
    return key;
  }
  if (data.length === 1 && data[0] === 0x08) {
    key.name = "backspace";
    key.ctrl = true;
    return key;
  }
  if (data.length === 1 && data[0] === 0x1f) {
    key.name = "/";
    key.ctrl = true;
    return key;
  }
  if (data.length === 1 && data[0] < 27) {
    key.ctrl = true;
    key.name = String.fromCharCode(data[0] + 96);
    return key;
  }
  if (data.length === 2 && data[0] === 0x1b && data[1] >= 0x20) {
    key.alt = true;
    key.name = String.fromCharCode(data[1]);
    return key;
  }

  // function keys (ESC O ...)
  if (data[0] === 0x1b && data[1] === 0x4f) {
    switch (data[2]) {
      case 0x50:
        key.name = "f1";
        break;
      case 0x51:
        key.name = "f2";
        break;
      case 0x52:
        key.name = "f3";
        break;
      case 0x53:
        key.name = "f4";
        break;
      default:
        key.name = "unknown";
        break;
    }
    return key;
  }

  // escape sequences
  if (data[0] === 0x1b && data[1] === 0x5b) {
    switch (data.toString("utf8", 2)) {
      case "A":
        key.name = "up";
        break;
      case "B":
        key.name = "down";
        break;
      case "C":
        key.name = "right";
        break;
      case "D":
        key.name = "left";
        break;
      case "H":
        key.name = "home";
        break;
      case "F":
        key.name = "end";
        break;
      case "5~":
        key.name = "pageup";
        break;
      case "6~":
        key.name = "pagedown";
        break;
      case "3~":
        key.name = "delete";
        break;
      case "20~":
        key.name = "f9";
        break;
      case "3;5~":
        key.name = "delete";
        key.ctrl = true;
        break;
      case "1;2A":
        key.name = "up";
        key.shift = true;
        break;
      case "1;2B":
        key.name = "down";
        key.shift = true;
        break;
      case "1;2C":
        key.name = "right";
        key.shift = true;
        break;
      case "1;2D":
        key.name = "left";
        key.shift = true;
        break;
      case "1;2H":
        key.name = "home";
        key.shift = true;
        break;
      case "1;2F":
        key.name = "end";
        key.shift = true;
        break;
      case "1;3A":
        key.name = "up";
        key.alt = true;
        break;
      case "1;3B":
        key.name = "down";
        key.alt = true;
        break;
      case "1;5A":
        key.name = "up";
        key.ctrl = true;
        break;
      case "1;5B":
        key.name = "down";
        key.ctrl = true;
        break;
      case "1;5C":
        key.name = "right";
        key.ctrl = true;
        break;
      case "1;5D":
        key.name = "left";
        key.ctrl = true;
        break;
      case "1;6A":
        key.name = "up";
        key.ctrl = true;
        key.shift = true;
        break;
      case "1;6B":
        key.name = "down";
        key.ctrl = true;
        key.shift = true;
        break;
      case "1;6C":
        key.name = "right";
        key.ctrl = true;
        key.shift = true;
        break;
      case "1;6D":
        key.name = "left";
        key.ctrl = true;
        key.shift = true;
        break;
      case "1;7A":
        key.name = "up";
        key.ctrl = true;
        key.alt = true;
        break;
      case "1;7B":
        key.name = "down";
        key.ctrl = true;
        key.alt = true;
        break;
      case "1;7C":
        key.name = "right";
        key.ctrl = true;
        key.alt = true;
        break;
      case "1;7D":
        key.name = "left";
        key.ctrl = true;
        key.alt = true;
        break;
      default:
        key.name = "unknown";
        break;
    }
    return key;
  }

  if (data[0] === 127) {
    key.name = "backspace";
    return key;
  }

  key.name = data.toString("utf8");
  return key;
}

// ----- InputManager -----

// ----- Shortcut Matching -----

export function keyToCombo(key: KeyEvent): string {
  const parts: string[] = [];
  if (key.ctrl) parts.push("ctrl");
  if (key.alt) parts.push("alt");
  if (key.shift) parts.push("shift");
  parts.push(key.name);
  return parts.join("+");
}

export interface InputManager {
  start(): void;
  stop(): void;
  pushLayer(name: string): InputLayer;
  popLayer(layer: InputLayer): void;
  /** Register a keyboard shortcut. Combo format: "ctrl+s", "alt+up", "f9", etc. */
  registerShortcut(combo: string, action: string): void;
  /** Remove a registered shortcut. */
  unregisterShortcut(combo: string): void;
}

export function createInputManager(): InputManager {
  const layers: LayerInternal[] = [];
  const shortcuts = new Map<string, string>();
  let pasteBuffer: Buffer | null = null;
  let running = false;

  const pasteStart = Buffer.from([0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e]);
  const pasteEnd = Buffer.from([0x1b, 0x5b, 0x32, 0x30, 0x31, 0x7e]);

  function emit<E extends InputEventName>(event: E, data: InputEventMap[E]): boolean {
    // top layer first, stop if handler returns true
    for (let i = layers.length - 1; i >= 0; i--) {
      const handlers = layers[i].handlers.get(event);
      if (handlers) {
        for (const handler of handlers) {
          if (handler(data) === true) return true;
        }
      }
    }
    return false;
  }

  function onData(data: Buffer) {
    // focus in/out (ESC [ I / ESC [ O)
    if (
      data[0] === 0x1b &&
      data[1] === 0x5b &&
      (data[2] === 0x49 || data[2] === 0x4f) &&
      data.length === 3
    ) {
      emit(data[2] === 0x49 ? "focus:in" : "focus:out", undefined as never);
      return;
    }

    // mouse events
    if (data[0] === 0x1b && data[1] === 0x5b && (data[2] === 0x3c || data[2] === 0x4d)) {
      const mouse = parseMouse(data);
      if (mouse) {
        if (mouse.type === "click") emit("mouse:click", mouse);
        else if (mouse.type === "release") emit("mouse:release", mouse);
        else if (mouse.type === "drag") emit("mouse:drag", mouse);
        else emit("mouse:scroll", mouse);
      }
      return;
    }

    // bracketed paste: accumulate raw buffers
    if (pasteBuffer !== null) {
      pasteBuffer = Buffer.concat([pasteBuffer, data]);
      const endIdx = pasteBuffer.indexOf(pasteEnd);
      if (endIdx === -1) return;
      const text = pasteBuffer.subarray(0, endIdx).toString("utf8");
      const remaining = pasteBuffer.subarray(endIdx + pasteEnd.length);
      pasteBuffer = null;
      emit("paste", { text });
      if (remaining.length > 0) onData(remaining);
      return;
    }
    if (data.length >= 6 && pasteStart.every((b, i) => data[i] === b)) {
      const content = data.subarray(6);
      const endIdx = content.indexOf(pasteEnd);
      if (endIdx === -1) {
        pasteBuffer = Buffer.from(content);
        return;
      }
      emit("paste", { text: content.subarray(0, endIdx).toString("utf8") });
      const remaining = content.subarray(endIdx + pasteEnd.length);
      if (remaining.length > 0) onData(remaining);
      return;
    }

    // key events
    const key = parseKey(data);

    // check shortcuts before emitting raw key
    const combo = keyToCombo(key);
    const action = shortcuts.get(combo);
    if (action) {
      const handled = emit("shortcut", { action, key });
      if (handled) return;
    }

    emit("key", key);
  }

  function onResize() {
    emit("resize", undefined as never);
  }

  return {
    start() {
      if (running) return;
      running = true;
      process.stdin.on("data", onData);
      process.stdout.on("resize", onResize);
    },

    stop() {
      if (!running) return;
      running = false;
      process.stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", onResize);
    },

    pushLayer(name: string): InputLayer {
      const layer = createLayer(name);
      layers.push(layer);
      return layer;
    },

    popLayer(layer: InputLayer) {
      const idx = layers.indexOf(layer as LayerInternal);
      if (idx >= 0) layers.splice(idx, 1);
    },

    registerShortcut(combo: string, action: string) {
      shortcuts.set(combo.toLowerCase(), action);
    },

    unregisterShortcut(combo: string) {
      shortcuts.delete(combo.toLowerCase());
    },
  };
}
