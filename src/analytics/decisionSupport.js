const REACH_METRES = 1.6;
const VALUE_RADIUS_METRES = 4;
const MOMENTUM_BIN_SECONDS = 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const contexts = {
  transition: {
    role: "wide-cover", point: "cover point", window: "live pass", end: "recovery",
    reach: "Interception reach", cue: "the pass release", task: "protect the wide lane",
  },
  press: {
    role: "pressing", point: "pressing point", window: "press", end: "tackle",
    reach: "Pressing reach", cue: "Away's recovery", task: "stay goal-side while closing down",
  },
  attack: {
    role: "attacking support", point: "support point", window: "deep pass", end: "shot",
    reach: "Receiving reach", cue: "the deep pass", task: "time the run into the receiving lane",
  },
};

export function createPossessionValue(csv, pitch) {
  const grid = csv.trim().split(/\r?\n/).map((row) => row.split(",").map(Number));
  const rows = grid.length;
  const columns = grid[0].length;
  if (rows !== 32 || columns !== 50 || grid.some((row) => row.length !== columns || row.some((value) => !Number.isFinite(value)))) {
    throw new Error("The Friends of Tracking possession-value grid is invalid.");
  }
  return ({ x, y }, attacksRight) => {
    if (x < 0 || x > pitch.length || y < 0 || y > pitch.width) return 0;
    const col = Math.min(columns - 1, Math.floor(x / pitch.length * columns));
    // FoT uses center-origin metres with positive y toward the top touchline.
    const row = Math.min(rows - 1, Math.floor((1 - y / pitch.width) * rows));
    return grid[row][attacksRight ? col : columns - 1 - col];
  };
}

export function buildMomentum(match, possessionValue) {
  const bins = new Array(Math.floor(match.matchEndSeconds / MOMENTUM_BIN_SECONDS) + 1).fill(0);
  for (const { team, period, time, location } of match.events) {
    const home = team === "HOME";
    const homeAttacksRight = period === 1 ? match.homeAttacksRightFirstHalf : !match.homeAttacksRightFirstHalf;
    bins[Math.floor(time / MOMENTUM_BIN_SECONDS)] += (home ? 1 : -1)
      * possessionValue(location, home ? homeAttacksRight : !homeAttacksRight);
  }
  const rolling = bins.map((value, index) => value + (bins[index - 1] ?? 0) + (bins[index - 2] ?? 0));
  const peak = Math.max(0.0001, ...rolling.map(Math.abs));
  return rolling.map((value, minute) => ({ minute, value: value / peak }));
}

function summarize(frames, playerId, tacticalPoints, action, ballTeamAttacksRight, possessionValue) {
  let totalDistance = 0;
  let closest = Infinity;
  let reachable = 0;
  let actionFrames = 0;
  let peakValue = 0;
  let accessibleValue = 0;
  for (const [index, frame] of frames.entries()) {
    const player = frame.players[playerId];
    totalDistance += distance(player, tacticalPoints[index]);
    if (frame.sourceFrame >= action.startFrame && frame.sourceFrame < action.endFrame) {
      const ballDistance = distance(player, frame.ball);
      const value = possessionValue(frame.ball, ballTeamAttacksRight);
      closest = Math.min(closest, ballDistance);
      reachable += Number(ballDistance <= REACH_METRES);
      actionFrames += 1;
      peakValue = Math.max(peakValue, value);
      accessibleValue = Math.max(accessibleValue, value * clamp01(1 - ballDistance / VALUE_RADIUS_METRES));
    }
  }
  return {
    coverError: totalDistance / frames.length,
    closest,
    reachPercent: 100 * reachable / actionFrames,
    accessibleValue: 100 * accessibleValue,
    accessRatio: peakValue ? accessibleValue / peakValue : 0,
  };
}

export function analyzeScenario({ match, momentId, simulation, possessionValue }) {
  const moment = match.moments.find(({ id }) => id === momentId);
  const { baselineFrames, alternativeFrames, outgoingPlayerId, incomingPlayerId, tacticalPoints } = simulation;
  const { action, context } = moment;
  const { role, point, window, end, reach, cue, task } = contexts[context];
  const recordedPlayer = match.players.find(({ id }) => id === outgoingPlayerId).displayName;
  const incoming = match.players.find(({ id }) => id === incomingPlayerId);
  const candidateName = incoming?.scouting?.name ?? incoming?.displayName ?? "the replacement";
  const engageRange = incoming?.settings?.engageRange;
  const firstEngaged = simulation.engagedFrames?.findIndex(Boolean) ?? -1;
  const homeHasBall = action.team === "HOME";
  const ballTeam = homeHasBall ? "Home" : "Away";
  const ballTeamAttacksRight = homeHasBall ? match.homeAttacksRightFirstHalf : !match.homeAttacksRightFirstHalf;
  const summarizeBranch = (frames, playerId) => summarize(frames, playerId, tacticalPoints, action,
    ballTeamAttacksRight, possessionValue);
  const original = summarizeBranch(baselineFrames, outgoingPlayerId);
  const candidate = summarizeBranch(alternativeFrames, incomingPlayerId);
  const metric = (id, label, unit, better, explanation) => ({
    id, label, unit, better, explanation, baseline: original[id], alternative: candidate[id],
    delta: Number((candidate[id] - original[id]).toFixed(2)),
  });
  const fit = {
    cover: 40 * clamp01(1 - candidate.coverError / 12),
    access: 40 * clamp01(1 - candidate.closest / 6),
    value: 20 * candidate.accessRatio,
  };
  const score = Math.round(fit.cover + fit.access + fit.value);
  const title = score >= 85 ? "Strong modeled fit" : score >= 70 ? "Good modeled fit"
    : score >= 50 ? "Partial modeled fit" : "Weak modeled fit";

  const comparison = candidate.closest <= original.closest
    ? `The modeled run closed to the ball at least as closely as ${recordedPlayer}. Review whether it can still ${task}.`
    : `${recordedPlayer} got closer to the ball. Coach the replacement to react to ${cue} and ${task}.`;
  const reachEvidence = candidate.reachPercent === 0
    ? `The replacement stayed outside 1.6 m reach before the recorded ${end}.`
    : `The replacement was within 1.6 m on ${candidate.reachPercent.toFixed(1)}% of frames in the ${window}.`;
  const engagement = engageRange === undefined ? null : firstEngaged >= 0
    ? `He went for the ball from ${baselineFrames[firstEngaged].time.toFixed(1)} s, when its path came within his ${engageRange.toFixed(1)} m engage range.`
    : `He held the ${point}: the ball never came within his ${engageRange.toFixed(1)} m engage range in time.`;
  return {
    metrics: [
      metric("coverError", `Mean distance to ${point}`, "m", "lower", `Mean distance to the assigned ${point} across the clip.`),
      metric("closest", `Closest during the ${window}`, "m", "lower", `Minimum distance to the tracked ball during the ${window}, before the recorded ${end}.`),
      metric("reachPercent", reach, "% of action frames", "higher", `Share of frames during the ${window} within 1.6 m of the tracked ball. Distance alone cannot establish ball height or control.`),
      metric("accessibleValue", "Reachable possession value", "EPV × 100", "higher", `Maximum ${ballTeam} ball-location EPV discounted linearly by distance from 0 to 4 m during the ${window}.`),
    ],
    recommendation: {
      title,
      score,
      fitLabel: `Home ${role} fit`,
      reasoning: [
        `${comparison} Closest approach was ${candidate.closest.toFixed(1)} m for the replacement and ${original.closest.toFixed(1)} m for ${recordedPlayer}.`,
        reachEvidence,
        engagement,
        `Home's ${role} role awards ${fit.cover.toFixed(1)}/40 for positioning, ${fit.access.toFixed(1)}/40 for access to the ball, and ${fit.value.toFixed(1)}/20 for possession-value access.`,
      ].filter(Boolean),
      caveat: `Settings come from ${candidateName}'s 2024/25 A-League measurements (SkillCorner). The run is still a modeled estimate in a different match. This one-clip score describes fit for Home's assigned ${role} role.`,
    },
    assumptions: simulation.assumptions,
    qualityLabel: "Low confidence · One clip · Measured player attributes",
  };
}
