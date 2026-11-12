/** Source-time seeking. Missing/gapped observations stay unavailable; no interpolation. */
export function frameAtTime(frames, timeSec, fps = 25) {
  if (!frames.length || !Number.isFinite(timeSec)) return null;
  const basis = (f) => f.timeSec ?? f.periodTimeSec;
  let low = 0, high = frames.length - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (basis(frames[middle]) <= timeSec + 1e-8) { found = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (found < 0 || timeSec - basis(frames[found]) > 1.5 / fps) return null;
  return frames[found];
}

export function createReplayClock({ durationSec, onTime, requestFrame, cancelFrame }) {
  let time = 0, speed = 1, playing = false, previous, handle;
  const stop = () => { playing = false; previous = undefined; if (handle !== undefined) cancelFrame(handle); };
  function tick(stamp) {
    if (!playing) return;
    time = Math.min(durationSec, time + Math.max(0, (stamp - (previous ?? stamp)) / 1000) * speed);
    previous = stamp;
    if (time >= durationSec) stop();
    onTime(time, playing);
    if (playing) handle = requestFrame(tick);
  }
  return {
    play() { if (playing) return; if (time >= durationSec) time = 0; playing = true; previous = undefined; handle = requestFrame(tick); onTime(time, true); },
    pause() { stop(); onTime(time, false); },
    seek(value) { if (!Number.isFinite(value)) throw new Error("Invalid replay time."); time = Math.max(0, Math.min(durationSec, value)); previous = undefined; onTime(time, playing); },
    setSpeed(value) { if (![.5, 1, 2, 4].includes(value)) throw new Error("Unsupported replay speed."); speed = value; },
    get playing() { return playing; },
    destroy: stop,
  };
}
