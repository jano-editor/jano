import { WriteStream } from "node:tty";

const ESC = "\x1b";

export interface Screen {
  readonly width: number;
  readonly height: number;
  enter(): void;
  leave(): void;
  clear(): void;
  moveTo(x: number, y: number): void;
  showCursor(): void;
  hideCursor(): void;
  write(data: string): void;
}

export function createScreen(stream: WriteStream = process.stdout as WriteStream): Screen {
  const write = (data: string) => stream.write(data);

  return {
    get width() {
      return stream.columns;
    },
    get height() {
      return stream.rows;
    },

    enter() {
      write(`${ESC}[?1049h`); // alternate buffer
      write(`${ESC}[?25l`); // hide cursor
      write(`${ESC}[?2004h`); // enable bracketed paste
      write(`${ESC}[?1000h`); // enable mouse tracking (clicks + scroll)
      write(`${ESC}[?1006h`); // SGR extended mouse encoding
    },

    leave() {
      write(`${ESC}[?1006l`); // disable SGR extended mouse
      write(`${ESC}[?1000l`); // disable mouse tracking
      write(`${ESC}[?2004l`); // disable bracketed paste
      write(`${ESC}[?25h`); // show cursor
      write(`${ESC}[?1049l`); // restore buffer
    },

    clear() {
      write(`${ESC}[2J`);
    },

    moveTo(x: number, y: number) {
      write(`${ESC}[${y + 1};${x + 1}H`);
    },

    showCursor() {
      write(`${ESC}[?25h`);
    },
    hideCursor() {
      write(`${ESC}[?25l`);
    },

    write(data: string) {
      write(data);
    },
  };
}
