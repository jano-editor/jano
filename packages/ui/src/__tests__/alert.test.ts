import { describe, it, expect } from "bun:test";
import { createAlert, alertHandleClick, type AlertOptions } from "../alert.ts";

// hit areas are normally set by drawAlert, set them by hand to keep the test screen-free
function alertWithHitAreas(opts: AlertOptions, onClose?: () => void) {
  const state = createAlert(opts, onClose);
  state.bodyHitArea = { x: 10, y: 5, w: 20 };
  state.closeHitArea = { x: 30, y: 5, w: 3 };
  return state;
}

describe("alertHandleClick", () => {
  it("closes on ✕", () => {
    let closed = false;
    const state = alertWithHitAreas({ message: "hi" }, () => (closed = true));
    expect(alertHandleClick(state, 31, 5)).toBe(true);
    expect(closed).toBe(true);
  });

  it("calls onClick when the message is clicked", () => {
    let clicks = 0;
    const state = alertWithHitAreas({ message: "hi", onClick: () => clicks++ });
    expect(alertHandleClick(state, 15, 5)).toBe(true);
    expect(clicks).toBe(1);
    expect(state.closed).toBe(false);
  });

  it("ignores message clicks without onClick", () => {
    const state = alertWithHitAreas({ message: "hi" });
    expect(alertHandleClick(state, 15, 5)).toBe(false);
  });

  it("ignores clicks outside the alert", () => {
    let clicks = 0;
    const state = alertWithHitAreas({ message: "hi", onClick: () => clicks++ });
    expect(alertHandleClick(state, 15, 6)).toBe(false);
    expect(clicks).toBe(0);
  });
});
