export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  raw: Buffer;
}

export function parseKey(data: Buffer): KeyEvent {
  const key: KeyEvent = { name: '', ctrl: false, shift: false, raw: data };

  // enter (13) and tab (9) must be checked before ctrl
  if (data.length === 1 && data[0] === 13) {
    key.name = 'enter';
    return key;
  }
  if (data.length === 1 && data[0] === 9) {
    key.name = 'tab';
    return key;
  }

  // ctrl+letter
  if (data.length === 1 && data[0] < 27) {
    key.ctrl = true;
    key.name = String.fromCharCode(data[0] + 96);
    return key;
  }

  // escape sequences
  if (data[0] === 0x1b && data[1] === 0x5b) {
    switch (data.toString('utf8', 2)) {
      case 'A': key.name = 'up'; break;
      case 'B': key.name = 'down'; break;
      case 'C': key.name = 'right'; break;
      case 'D': key.name = 'left'; break;
      case 'H': key.name = 'home'; break;
      case 'F': key.name = 'end'; break;
      case '5~': key.name = 'pageup'; break;
      case '6~': key.name = 'pagedown'; break;
      case '3~': key.name = 'delete'; break;
      case '1;2A': key.name = 'up'; key.shift = true; break;
      case '1;2B': key.name = 'down'; key.shift = true; break;
      case '1;2C': key.name = 'right'; key.shift = true; break;
      case '1;2D': key.name = 'left'; key.shift = true; break;
      case '1;2H': key.name = 'home'; key.shift = true; break;
      case '1;2F': key.name = 'end'; key.shift = true; break;
      case '1;5A': key.name = 'up'; key.ctrl = true; break;
      case '1;5B': key.name = 'down'; key.ctrl = true; break;
      case '1;5C': key.name = 'right'; key.ctrl = true; break;
      case '1;5D': key.name = 'left'; key.ctrl = true; break;
      default: key.name = 'unknown'; break;
    }
    return key;
  }

  // backspace
  if (data[0] === 127) {
    key.name = 'backspace';
    return key;
  }

  // regular character
  key.name = data.toString('utf8');
  return key;
}
