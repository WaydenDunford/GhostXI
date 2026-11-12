import { createGhostXIClient } from "./backend/ghostxi";
import { apiBase } from "./match-catalog";

// The same origin is proxied to the local Node API in development and production.
export const ghostxi = createGhostXIClient({
  baseUrl: `${(apiBase() ?? "").replace(/\/+$/, "").replace(/\/api(?:\/v1)?$/, "")}/api/v1`,
  fetchImpl: (input, init) =>
    fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
});

export function sourceFrameAt<T extends { timeSec?: number; periodTimeSec?: number }>(
  frames: T[],
  time: number,
  fps = 25,
): T | null {
  let lo = 0,
    hi = frames.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((frames[mid]!.timeSec ?? frames[mid]!.periodTimeSec ?? 0) <= time + 1e-8) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const frame = frames[found];
  return frame && time - (frame.timeSec ?? frame.periodTimeSec ?? 0) <= 1.5 / fps ? frame : null;
}
