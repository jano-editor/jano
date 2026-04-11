import type { Screen } from "./screen.ts";
import type { Draw } from "./draw.ts";
import type { RGB } from "./color.ts";
import type { InputManager, InputLayer, KeyEvent, MouseEvent } from "./input-manager.ts";

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
  border?: "single" | "double" | "round";
  width?: number;
}

export type DialogResult =
  | { type: "button"; value: string; inputValue?: string }
  | { type: "input"; value: string }
  | { type: "cancel" };

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
  inputMgr: InputManager,
  screen: Screen,
  draw: Draw,
  opts: DialogOptions,
  renderBackground: () => void,
): Promise<DialogResult> {
  return new Promise((resolve) => {
    const buttons = opts.buttons ?? [];
    const hasInput = opts.input ?? false;
    let selectedButton = 0;
    let inputText = opts.inputValue ?? "";
    let inputCursorX = inputText.length;
    let buttonsActive = !hasInput;

    const dialogW = opts.width ?? Math.min(50, screen.width - 4);
    const messageLines = wrapText(opts.message, dialogW - 4);

    let backgroundDrawn = false;
    const buttonHitAreas: { x: number; y: number; w: number; idx: number }[] = [];
    let layer: InputLayer | null = null;

    function calcHeight(): number {
      let h = 2;
      h += messageLines.length;
      if (hasInput) h += 2;
      if (buttons.length > 0) h += 2;
      return h;
    }

    function renderDialog() {
      if (!backgroundDrawn) {
        renderBackground();
        backgroundDrawn = true;
      }

      const w = dialogW;
      const h = calcHeight();
      const x = Math.floor((screen.width - w) / 2);
      const y = Math.floor((screen.height - h) / 2);

      draw.rect(x, y, w, h, {
        fg: theme.border,
        border: opts.border ?? "round",
        fill: theme.fill,
      });

      if (opts.title) {
        const titleText = ` ${opts.title} `;
        const titleX = x + Math.floor((w - titleText.length) / 2);
        draw.text(titleX, y, titleText, { fg: theme.title });
      }

      let row = y + 1;
      for (const line of messageLines) {
        draw.text(x + 2, row, line, { fg: theme.message, bg: theme.fill });
        row++;
      }

      if (hasInput) {
        row++;
        const inputW = w - 4;
        for (let i = 0; i < inputW; i++) {
          draw.char(x + 2 + i, row, " ", { bg: theme.inputBg });
        }
        const visibleText = inputText.substring(0, inputW);
        draw.text(x + 2, row, visibleText, { fg: theme.inputFg, bg: theme.inputBg });
        if (inputText.length === 0 && opts.inputPlaceholder) {
          draw.text(x + 2, row, opts.inputPlaceholder.substring(0, inputW), {
            fg: [100, 100, 100],
            bg: theme.inputBg,
          });
        }
        row++;
      }

      buttonHitAreas.length = 0;
      if (buttons.length > 0) {
        row++;
        const btnWidths = buttons.map((b) => b.label.length + 2);
        const totalLen = btnWidths.reduce((a, b) => a + b, 0) + (buttons.length - 1) * 2;
        let btnX = x + Math.floor((w - totalLen) / 2);

        for (let i = 0; i < buttons.length; i++) {
          const label = ` ${buttons[i].label} `;
          const isActive = buttonsActive && i === selectedButton;
          draw.text(btnX, row, label, {
            fg: isActive ? theme.buttonActiveFg : theme.buttonFg,
            bg: isActive ? theme.buttonActiveBg : theme.buttonBg,
          });
          buttonHitAreas.push({ x: btnX, y: row, w: btnWidths[i], idx: i });
          btnX += btnWidths[i] + 2;
        }
      }

      draw.flush();

      if (hasInput && !buttonsActive) {
        const inputY = y + 1 + messageLines.length + 1;
        screen.moveTo(x + 2 + inputCursorX, inputY);
        screen.showCursor();
      } else {
        screen.hideCursor();
      }
    }

    function done(result: DialogResult) {
      if (layer) inputMgr.popLayer(layer);
      resolve(result);
    }

    layer = inputMgr.pushLayer("dialog");

    layer.on("key", (key: KeyEvent) => {
      // escape = cancel
      if (key.raw.length === 1 && key.raw[0] === 0x1b) {
        done({ type: "cancel" });
        return true;
      }

      // enter
      if (key.name === "enter") {
        if (hasInput && !buttonsActive && buttons.length > 0) {
          buttonsActive = true;
          renderDialog();
          return true;
        }
        if (hasInput && !buttonsActive && buttons.length === 0) {
          done({ type: "input", value: inputText });
        } else if (buttons.length > 0) {
          done({ type: "button", value: buttons[selectedButton].value, inputValue: inputText });
        }
        return true;
      }

      // tab: switch between input and buttons
      if (key.name === "tab" && hasInput && buttons.length > 0) {
        buttonsActive = !buttonsActive;
        renderDialog();
        return true;
      }

      // arrows
      if (buttonsActive) {
        if (key.name === "right") {
          selectedButton = Math.min(selectedButton + 1, buttons.length - 1);
          renderDialog();
        }
        if (key.name === "left") {
          selectedButton = Math.max(selectedButton - 1, 0);
          renderDialog();
        }
      } else if (hasInput) {
        if (key.name === "right") inputCursorX = Math.min(inputCursorX + 1, inputText.length);
        if (key.name === "left") inputCursorX = Math.max(inputCursorX - 1, 0);
        if (key.name === "home") inputCursorX = 0;
        if (key.name === "end") inputCursorX = inputText.length;
        renderDialog();
      }

      // backspace in input
      if (key.name === "backspace" && hasInput && !buttonsActive) {
        if (inputCursorX > 0) {
          inputText = inputText.substring(0, inputCursorX - 1) + inputText.substring(inputCursorX);
          inputCursorX--;
          renderDialog();
        }
        return true;
      }

      // regular typing in input
      if (hasInput && !buttonsActive && !key.ctrl && !key.alt) {
        const ch = key.name;
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 32 && ch.length === 1) {
          inputText = inputText.substring(0, inputCursorX) + ch + inputText.substring(inputCursorX);
          inputCursorX += ch.length;
          renderDialog();
        }
      }

      return true; // block all keys from reaching lower layers
    });

    layer.on("mouse:click", (mouse: MouseEvent) => {
      for (const hit of buttonHitAreas) {
        if (mouse.y === hit.y && mouse.x >= hit.x && mouse.x < hit.x + hit.w) {
          done({ type: "button", value: buttons[hit.idx].value, inputValue: inputText });
          return true;
        }
      }
      return true; // block clicks from editor
    });

    // block all other events from reaching editor
    layer.on("mouse:drag", () => true);
    layer.on("mouse:release", () => true);
    layer.on("mouse:scroll", () => true);
    layer.on("paste", (event) => {
      if (hasInput && !buttonsActive) {
        inputText =
          inputText.substring(0, inputCursorX) + event.text + inputText.substring(inputCursorX);
        inputCursorX += event.text.length;
        renderDialog();
      }
      return true;
    });

    renderDialog();
  });
}

function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= maxWidth) {
      result.push(line);
    } else {
      let remaining = line;
      while (remaining.length > maxWidth) {
        let breakAt = remaining.lastIndexOf(" ", maxWidth);
        if (breakAt <= 0) breakAt = maxWidth;
        result.push(remaining.substring(0, breakAt));
        remaining = remaining.substring(breakAt).trimStart();
      }
      if (remaining.length > 0) result.push(remaining);
    }
  }
  return result;
}
