import type { Screen } from './screen.js';
import type { Draw } from './draw.js';
import type { RGB } from './color.js';

export interface DialogButton {
  label: string;
  value: string;
}

export interface DialogOptions {
  title?: string;
  message: string;
  buttons?: DialogButton[];
  input?: boolean;
  inputPlaceholder?: string;
  inputValue?: string;
  border?: 'single' | 'double' | 'round';
  width?: number;
}

export type DialogResult =
  | { type: 'button'; value: string; inputValue?: string }
  | { type: 'input'; value: string }
  | { type: 'cancel' };

const theme = {
  border: [120, 120, 120] as RGB,
  title: [255, 255, 100] as RGB,
  message: [200, 200, 200] as RGB,
  buttonFg: [0, 0, 0] as RGB,
  buttonBg: [180, 180, 180] as RGB,
  buttonActiveFg: [0, 0, 0] as RGB,
  buttonActiveBg: [100, 200, 255] as RGB,
  inputFg: [255, 255, 255] as RGB,
  inputBg: [50, 50, 50] as RGB,
  fill: [30, 30, 30] as RGB,
};

export function showDialog(
  screen: Screen,
  draw: Draw,
  opts: DialogOptions,
  renderBackground: () => void,
): Promise<DialogResult> {
  return new Promise((resolve) => {
    const buttons = opts.buttons ?? [];
    const hasInput = opts.input ?? false;
    let selectedButton = 0;
    let inputText = opts.inputValue ?? '';
    let inputCursorX = inputText.length;
    // when both input and buttons: false = input focused, true = buttons focused
    let buttonsActive = !hasInput;

    const dialogW = opts.width ?? Math.min(50, screen.width - 4);
    const messageLines = wrapText(opts.message, dialogW - 4);

    function calcHeight(): number {
      let h = 2; // top/bottom border
      h += messageLines.length; // message
      if (hasInput) h += 2; // input row + spacing
      if (buttons.length > 0) h += 2; // button row + spacing
      return h;
    }

    function renderDialog() {
      // re-draw background first
      renderBackground();

      const w = dialogW;
      const h = calcHeight();
      const x = Math.floor((screen.width - w) / 2);
      const y = Math.floor((screen.height - h) / 2);

      // dialog box
      draw.rect(x, y, w, h, {
        fg: theme.border,
        border: opts.border ?? 'round',
        fill: theme.fill,
      });

      // title
      if (opts.title) {
        const titleText = ` ${opts.title} `;
        const titleX = x + Math.floor((w - titleText.length) / 2);
        draw.text(titleX, y, titleText, { fg: theme.title });
      }

      // message
      let row = y + 1;
      for (const line of messageLines) {
        draw.text(x + 2, row, line, { fg: theme.message, bg: theme.fill });
        row++;
      }

      // input field
      if (hasInput) {
        row++;
        const inputW = w - 4;
        // input background
        for (let i = 0; i < inputW; i++) {
          draw.char(x + 2 + i, row, ' ', { bg: theme.inputBg });
        }
        // input text
        const visibleText = inputText.substring(0, inputW);
        draw.text(x + 2, row, visibleText, {
          fg: theme.inputFg,
          bg: theme.inputBg,
        });
        // placeholder
        if (inputText.length === 0 && opts.inputPlaceholder) {
          draw.text(x + 2, row, opts.inputPlaceholder.substring(0, inputW), {
            fg: [100, 100, 100],
            bg: theme.inputBg,
          });
        }
        row++;
      }

      // buttons
      if (buttons.length > 0) {
        row++;
        const totalLen = buttons.reduce((sum, b) => sum + b.label.length + 4, 0)
          + (buttons.length - 1) * 2;
        let btnX = x + Math.floor((w - totalLen) / 2);

        for (let i = 0; i < buttons.length; i++) {
          const label = ` ${buttons[i].label} `;
          const isActive = buttonsActive && i === selectedButton;
          draw.text(btnX, row, label, {
            fg: isActive ? theme.buttonActiveFg : theme.buttonFg,
            bg: isActive ? theme.buttonActiveBg : theme.buttonBg,
          });
          btnX += label.length + 2;
        }
      }

      draw.flush();

      // position cursor on input field if active
      if (hasInput && !buttonsActive) {
        const inputY = y + 1 + messageLines.length + 1;
        screen.moveTo(x + 2 + inputCursorX, inputY);
        screen.showCursor();
      } else {
        screen.hideCursor();
      }
    }

    function onData(data: Buffer) {
      // escape = cancel
      if (data[0] === 0x1b && data.length === 1) {
        cleanup();
        resolve({ type: 'cancel' });
        return;
      }

      // enter
      if (data[0] === 13) {
        if (hasInput && !buttonsActive && buttons.length > 0) {
          // move focus from input to buttons
          buttonsActive = true;
          renderDialog();
          return;
        }
        cleanup();
        if (hasInput && !buttonsActive && buttons.length === 0) {
          resolve({ type: 'input', value: inputText });
        } else if (buttons.length > 0) {
          resolve({ type: 'button', value: buttons[selectedButton].value, inputValue: inputText });
        }
        return;
      }

      // tab: switch between input and buttons
      if (data[0] === 9 && hasInput && buttons.length > 0) {
        buttonsActive = !buttonsActive;
        renderDialog();
        return;
      }

      // escape sequences (arrows)
      if (data[0] === 0x1b && data[1] === 0x5b) {
        const seq = data.toString('utf8', 2);
        if (buttonsActive) {
          if (seq === 'C' || seq === 'D') {
            // left/right between buttons
            if (seq === 'C') selectedButton = Math.min(selectedButton + 1, buttons.length - 1);
            if (seq === 'D') selectedButton = Math.max(selectedButton - 1, 0);
            renderDialog();
          }
        } else if (hasInput) {
          // left/right in input
          if (seq === 'C') inputCursorX = Math.min(inputCursorX + 1, inputText.length);
          if (seq === 'D') inputCursorX = Math.max(inputCursorX - 1, 0);
          // home/end
          if (seq === 'H') inputCursorX = 0;
          if (seq === 'F') inputCursorX = inputText.length;
          renderDialog();
        }
        return;
      }

      // backspace in input
      if (data[0] === 127 && hasInput && !buttonsActive) {
        if (inputCursorX > 0) {
          inputText = inputText.substring(0, inputCursorX - 1) + inputText.substring(inputCursorX);
          inputCursorX--;
          renderDialog();
        }
        return;
      }

      // regular typing in input
      if (hasInput && !buttonsActive) {
        const ch = data.toString('utf8');
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 32) {
          inputText = inputText.substring(0, inputCursorX) + ch + inputText.substring(inputCursorX);
          inputCursorX += ch.length;
          renderDialog();
        }
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
    }

    // take over input
    process.stdin.on('data', onData);

    renderDialog();
  });
}

function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length <= maxWidth) {
      result.push(line);
    } else {
      let remaining = line;
      while (remaining.length > maxWidth) {
        let breakAt = remaining.lastIndexOf(' ', maxWidth);
        if (breakAt <= 0) breakAt = maxWidth;
        result.push(remaining.substring(0, breakAt));
        remaining = remaining.substring(breakAt).trimStart();
      }
      if (remaining.length > 0) result.push(remaining);
    }
  }
  return result;
}
