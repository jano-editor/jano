export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  raw: Buffer;
}

export interface MouseEvent {
  type: "scroll-up" | "scroll-down" | "scroll-left" | "scroll-right" | "click" | "drag";
  x: number;
  y: number;
}

export function parseMouse(data: Buffer): MouseEvent | null {
  if (data[0] !== 0x1b || data[1] !== 0x5b) return null;

  // SGR extended: ESC [ < button ; x ; y M (press) / m (release)
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

    return mouseFromButton(button, x, y, pressed);
  }

  // X10 / normal: ESC [ M Cb Cx Cy (6 bytes total)
  if (data[2] === 0x4d && data.length === 6) {
    const button = data[3] - 32;
    const x = data[4] - 33;
    const y = data[5] - 33;

    return mouseFromButton(button, x, y, true);
  }

  return null;
}

function mouseFromButton(
  button: number,
  x: number,
  y: number,
  pressed: boolean,
): MouseEvent | null {
  switch (button) {
    case 0:
      return pressed ? { type: "click", x, y } : null;
    case 32:
      return { type: "drag", x, y };
    case 64:
      return { type: "scroll-up", x, y };
    case 65:
      return { type: "scroll-down", x, y };
    // shift+scroll = horizontal scroll (shift adds +4 to button value)
    case 68:
      return { type: "scroll-left", x, y };
    case 69:
      return { type: "scroll-right", x, y };
    // ctrl+scroll = horizontal scroll fallback (ctrl adds +16)
    case 80:
      return { type: "scroll-left", x, y };
    case 81:
      return { type: "scroll-right", x, y };
    default:
      return null;
  }
}

export function parseKey(data: Buffer): KeyEvent {
  const key: KeyEvent = { name: "", ctrl: false, shift: false, alt: false, raw: data };

  // enter (13) and tab (9) must be checked before ctrl
  if (data.length === 1 && data[0] === 13) {
    key.name = "enter";
    return key;
  }
  if (data.length === 1 && data[0] === 9) {
    key.name = "tab";
    return key;
  }

  // ctrl+backspace (0x08)
  if (data.length === 1 && data[0] === 0x08) {
    key.name = "backspace";
    key.ctrl = true;
    return key;
  }

  // ctrl+/ (0x1f)
  if (data.length === 1 && data[0] === 0x1f) {
    key.name = "/";
    key.ctrl = true;
    return key;
  }

  // ctrl+letter
  if (data.length === 1 && data[0] < 27) {
    key.ctrl = true;
    key.name = String.fromCharCode(data[0] + 96);
    return key;
  }

  // alt+letter (ESC followed by a single printable char)
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

  // backspace
  if (data[0] === 127) {
    key.name = "backspace";
    return key;
  }

  // regular character
  key.name = data.toString("utf8");
  return key;
}
