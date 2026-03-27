const ESC = "\x1b";

export type RGB = [number, number, number];

export function fg(r: number, g: number, b: number): string {
  return `${ESC}[38;2;${r};${g};${b}m`;
}

export function bg(r: number, g: number, b: number): string {
  return `${ESC}[48;2;${r};${g};${b}m`;
}

export const reset = `${ESC}[0m`;
export const bold = `${ESC}[1m`;
export const dim = `${ESC}[2m`;
export const italic = `${ESC}[3m`;
export const underline = `${ESC}[4m`;
