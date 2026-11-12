import { advanceSteering } from "./alternative.js";
import { requireValue } from "../domain/validation.js";

export const modeledMovement = { maxSpeedMps: 5.4, accelerationMps2: 4, reactionSec: .25,
  ballReactionRadiusM: 4, separationRadiusM: 4, separationStrength: 2 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Genuine reference frames in metres. Combined integration runs its own joint state. */
export function simulateGhostBranch({ frames, replacements, pitch, anchors = {}, cueTimeSec = 0, seed = 42, parameters = modeledMovement }) {
  requireValue(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff && frames.length >= 2, "Invalid simulation seed/reference.");
  const originalIds = Object.keys(frames[0].players), candidates = replacements.map((r) => r.candidatePlayerId);
  requireValue(replacements.length >= 1 && replacements.length <= 4
    && new Set(replacements.map((r) => r.originalPlayerId)).size === replacements.length
    && new Set(candidates).size === candidates.length
    && replacements.every((r) => originalIds.includes(r.originalPlayerId) && !originalIds.includes(r.candidatePlayerId)), "Duplicate/active replacement or unknown original player.");
  const initial = new Map(replacements.map((r) => [r.originalPlayerId, {
    position: { ...frames[0].players[r.originalPlayerId] }, velocity: { x: 0, y: 0 },
    target: anchors[r.originalPlayerId] ?? frames.at(-1).players[r.originalPlayerId],
  }]));
  const state = new Map([...initial].map(([id, s]) => [id, structuredClone(s)]));
  let totalSeparation = 0;
  const result = frames.map((frame, index) => {
    if (index > 0) {
      const dt = frame.time - frames[index - 1].time;
      requireValue(dt > 0 && dt <= .1, "Cannot simulate through a tracking gap.");
      const next = new Map();
      for (const r of replacements) {
        const current = state.get(r.originalPlayerId);
        let target = { ...current.target };
        if (frame.time >= cueTimeSec + parameters.reactionSec) {
          const dx = frame.ball.x - target.x, dy = frame.ball.y - target.y;
          const scale = Math.min(1, parameters.ballReactionRadiusM / (Math.hypot(dx, dy) || 1));
          target = { x: target.x + dx * scale, y: target.y + dy * scale };
        }
        // Coupling is integrated from this branch's own previous state, before
        // updating either player. It is never a sum of individual outcomes.
        for (const [otherId, other] of state) if (otherId !== r.originalPlayerId) {
          const d = distance(current.position, other.position);
          if (d < parameters.separationRadiusM) {
            const fallback = r.originalPlayerId.localeCompare(otherId) < 0 ? -1 : 1;
            const ux = d > .001 ? (current.position.x - other.position.x) / d : fallback;
            const uy = d > .001 ? (current.position.y - other.position.y) / d : 0;
            const force = (parameters.separationRadiusM - d) * parameters.separationStrength;
            target.x += ux * force; target.y += uy * force; totalSeparation += force * dt;
          }
        }
        next.set(r.originalPlayerId, { ...current, ...advanceSteering({ ...current, target, dt,
          maxSpeed: parameters.maxSpeedMps, acceleration: parameters.accelerationMps2, pitch }) });
      }
      for (const [id, value] of next) state.set(id, value);
    }
    const players = structuredClone(frame.players);
    for (const r of replacements) { delete players[r.originalPlayerId]; players[r.candidatePlayerId] = { ...state.get(r.originalPlayerId).position }; }
    requireValue(Object.keys(players).length === originalIds.length, "Simulation changed team size.");
    return { ...frame, ball: { ...frame.ball }, players };
  });
  return { frames: result, modeledParameters: { ...parameters }, coupling: { separationEffort: totalSeparation,
    method: "simultaneous joint integration with mutual ghost separation; all non-replaced paths and ball fixed" }, seed };
}
