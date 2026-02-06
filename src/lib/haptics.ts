const supported = typeof navigator !== "undefined" && "vibrate" in navigator;

function vibrate(pattern: number | number[]) {
  if (supported) navigator.vibrate(pattern);
}

export const haptics = {
  tap: () => vibrate(10),
  success: () => vibrate([10, 50, 20]),
  heavy: () => vibrate(30),
  error: () => vibrate([30, 100, 30]),
};
