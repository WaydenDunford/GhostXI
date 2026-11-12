const REACH_METRES = 1.6;
const VALUE_RADIUS_METRES = 4;
const MOMENTUM_BIN_SECONDS = 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (value) => Math.max(0, Math.min(1, value));

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

function summarize(frames, playerId, coverPoint, interception, opponentAttacksRight, possessionValue) {
  let totalDistance = 0;
  let closest = Infinity;
  let reachable = 0;
  let passFrames = 0;
  let peakValue = 0;
  let accessibleValue = 0;
  for (const frame of frames) {
    const player = frame.players[playerId];
    totalDistance += distance(player, coverPoint);
    if (frame.sourceFrame >= interception.releaseFrame && frame.sourceFrame < interception.recoveryFrame) {
      const ballDistance = distance(player, frame.ball);
      const value = possessionValue(frame.ball, opponentAttacksRight);
      closest = Math.min(closest, ballDistance);
      reachable += Number(ballDistance <= REACH_METRES);
      passFrames += 1;
      peakValue = Math.max(peakValue, value);
      accessibleValue = Math.max(accessibleValue, value * clamp01(1 - ballDistance / VALUE_RADIUS_METRES));
    }
  }
  return {
    coverError: totalDistance / frames.length,
    closest,
    reachPercent: 100 * reachable / passFrames,
    accessibleValue: 100 * accessibleValue,
    accessRatio: peakValue ? accessibleValue / peakValue : 0,
  };
}

export function analyzeScenario({ match, momentId, simulation, possessionValue }) {
  const moment = match.moments.find(({ id }) => id === momentId);
  const { baselineFrames, alternativeFrames, outgoingPlayerId, incomingPlayerId, coverPoint } = simulation;
  const summarizeBranch = (frames, playerId) => summarize(frames, playerId, coverPoint, moment.interception,
    !match.homeAttacksRightFirstHalf, possessionValue);
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
  const title = score >= 85 ? "Must-have candidate" : score >= 70 ? "Strong prospect"
    : score >= 50 ? "Possible fit" : "Low fit";

  const comparison = candidate.closest <= original.closest
    ? "The modeled profile closed to the pass at least as closely as Home 2. Review how the step affects wide-lane cover."
    : "Home 2 got closer to the live pass. Coach the replacement to read the release cue and step into the lane sooner.";
  const reachEvidence = candidate.reachPercent === 0
    ? "The replacement stayed outside 1.6 m reach before the recorded recovery."
    : `The replacement was within 1.6 m on ${candidate.reachPercent.toFixed(1)}% of pre-recovery pass frames.`;
  return {
    metrics: [
      metric("coverError", "Mean distance to cover point", "m", "lower", "Mean distance to the assigned wide-cover point over the eight-second clip."),
      metric("closest", "Closest to the live pass", "m", "lower", "Minimum distance to the tracked ball after release and before the recorded recovery."),
      metric("reachPercent", "Interception reach", "% of pass frames", "higher", "Share of live-pass frames within 1.6 m of the tracked ball. Distance alone cannot establish ball height or control."),
      metric("accessibleValue", "Reachable possession value", "EPV × 100", "higher", "Maximum Away ball-location EPV discounted linearly by distance from 0 to 4 m during the live pass."),
    ],
    recommendation: {
      title,
      score,
      reasoning: [
        `${comparison} Closest approach was ${candidate.closest.toFixed(1)} m for the replacement and ${original.closest.toFixed(1)} m for Home 2.`,
        reachEvidence,
        `Home's wide-cover role awards ${fit.cover.toFixed(1)}/40 for positioning, ${fit.access.toFixed(1)}/40 for pass access, and ${fit.value.toFixed(1)}/20 for possession-value access.`,
      ],
      caveat: "The candidate profiles are hypothetical. This one-clip score describes fit for Home's assigned wide-cover role.",
    },
    assumptions: simulation.assumptions,
    qualityLabel: "Low confidence · One clip · Assumed player attributes",
  };
}
