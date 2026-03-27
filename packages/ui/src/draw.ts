import { fg, bg, reset } from "./color.ts";
import type { Screen } from "./screen.ts";
import type { RGB } from "./color.ts";

type BorderStyle = "single" | "double" | "round";

interface BorderChars {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
}

const borders: Record<BorderStyle, BorderChars> = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
};

interface StyleOpts {
  fg?: RGB;
  bg?: RGB;
}

interface RectOpts extends StyleOpts {
  border?: BorderStyle;
  fill?: RGB;
}

interface LineOpts extends StyleOpts {
  char?: string;
}

interface Cell {
  char: string;
  style: string;
}

export interface Draw {
  clear(): void;
  char(x: number, y: number, char: string, opts?: StyleOpts): void;
  text(x: number, y: number, text: string, opts?: StyleOpts): void;
  line(x1: number, y1: number, x2: number, y2: number, opts?: LineOpts): void;
  rect(x: number, y: number, w: number, h: number, opts?: RectOpts): void;
  flush(): void;
}

export function createDraw(screen: Screen): Draw {
  let buffer: Cell[][] = [];
  let bufW = 0;
  let bufH = 0;

  function ensureBuffer() {
    const w = screen.width;
    const h = screen.height;
    if (w !== bufW || h !== bufH) {
      bufW = w;
      bufH = h;
      buffer = [];
      for (let y = 0; y < h; y++) {
        buffer[y] = [];
        for (let x = 0; x < w; x++) {
          buffer[y][x] = { char: " ", style: "" };
        }
      }
    }
  }

  function set(x: number, y: number, char: string, style = "") {
    if (x < 0 || y < 0 || x >= bufW || y >= bufH) return;
    buffer[y][x] = { char, style };
  }

  function buildStyle(opts: StyleOpts): string {
    let s = "";
    if (opts.fg) s += fg(opts.fg[0], opts.fg[1], opts.fg[2]);
    if (opts.bg) s += bg(opts.bg[0], opts.bg[1], opts.bg[2]);
    return s;
  }

  return {
    clear() {
      ensureBuffer();
      for (let y = 0; y < bufH; y++) {
        for (let x = 0; x < bufW; x++) {
          buffer[y][x] = { char: " ", style: "" };
        }
      }
    },

    char(x: number, y: number, char: string, opts: StyleOpts = {}) {
      ensureBuffer();
      set(x, y, char, buildStyle(opts));
    },

    text(x: number, y: number, text: string, opts: StyleOpts = {}) {
      ensureBuffer();
      const style = buildStyle(opts);
      for (let i = 0; i < text.length; i++) {
        set(x + i, y, text[i], style);
      }
    },

    line(x1: number, y1: number, x2: number, y2: number, opts: LineOpts = {}) {
      ensureBuffer();
      const style = buildStyle(opts);
      const char = opts.char || (y1 === y2 ? "─" : "│");

      if (y1 === y2) {
        const start = Math.min(x1, x2);
        const end = Math.max(x1, x2);
        for (let x = start; x <= end; x++) {
          set(x, y1, char, style);
        }
      } else if (x1 === x2) {
        const start = Math.min(y1, y2);
        const end = Math.max(y1, y2);
        for (let y = start; y <= end; y++) {
          set(x1, y, char, style);
        }
      }
    },

    rect(x: number, y: number, w: number, h: number, opts: RectOpts = {}) {
      ensureBuffer();
      const style = buildStyle(opts);
      const b = borders[opts.border || "single"];

      // corners
      set(x, y, b.tl, style);
      set(x + w - 1, y, b.tr, style);
      set(x, y + h - 1, b.bl, style);
      set(x + w - 1, y + h - 1, b.br, style);

      // horizontal edges
      for (let i = 1; i < w - 1; i++) {
        set(x + i, y, b.h, style);
        set(x + i, y + h - 1, b.h, style);
      }

      // vertical edges
      for (let i = 1; i < h - 1; i++) {
        set(x, y + i, b.v, style);
        set(x + w - 1, y + i, b.v, style);
      }

      // fill inside
      if (opts.fill) {
        const fillStyle = buildStyle({ bg: opts.fill });
        for (let iy = 1; iy < h - 1; iy++) {
          for (let ix = 1; ix < w - 1; ix++) {
            set(x + ix, y + iy, " ", fillStyle);
          }
        }
      }
    },

    flush() {
      ensureBuffer();
      let out = "";
      for (let y = 0; y < bufH; y++) {
        out += `\x1b[${y + 1};1H`;
        let lastStyle = "";
        for (let x = 0; x < bufW; x++) {
          const cell = buffer[y][x];
          if (cell.style !== lastStyle) {
            out += reset + cell.style;
            lastStyle = cell.style;
          }
          out += cell.char;
        }
      }
      out += reset;
      screen.write(out);
    },
  };
}
