import { describe, expect, it } from "vitest";
import { sourceFrameAt } from "./ghostxi-api";

describe("recorded source playback", () => {
  it("uses exact source samples and refuses to interpolate across missing observations", () => {
    const frames = [{ periodTimeSec: 10.04 }, { periodTimeSec: 10.08 }, { periodTimeSec: 221.2 }];
    expect(sourceFrameAt(frames, 10.08)).toBe(frames[1]);
    expect(sourceFrameAt(frames, 15)).toBeNull();
    expect(sourceFrameAt(frames, 10)).toBeNull();
    expect(sourceFrameAt(frames, 221.2)).toBe(frames[2]);
  });
  it("uses relative simulation time without treating zero as absent", () => {
    const frames = [{ timeSec: 0 }, { timeSec: 0.04 }];
    expect(sourceFrameAt(frames, 0)).toBe(frames[0]);
    expect(sourceFrameAt(frames, 0.04)).toBe(frames[1]);
    expect(sourceFrameAt([], 0)).toBeNull();
  });
});
