import { point as validatePoint, requireValue, validateMoment } from "../domain/validation.js";

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
  requireValue(typeof csv === "string" && csv.trim().length > 0, "An EPV CSV grid is required.");
  requireValue(pitch && Number.isFinite(pitch.length) && pitch.length > 0
    && Number.isFinite(pitch.width) && pitch.width > 0, "Valid pitch dimensions are required.");
  requireValue(csv.trim().split(/\r?\n/).every((row) => row.split(",").every((cell) => cell.trim() !== "")), "EPV cells cannot be empty.");
  const grid = csv.trim().split(/\r?\n/).map((row) => row.split(",").map(Number));
  const rows = grid.length;
  const columns = grid[0].length;
  if (rows !== 32 || columns !== 50 || grid.some((row) => row.length !== columns || row.some((value) => !Number.isFinite(value) || value < 0))) {
    throw new Error("The Friends of Tracking possession-value grid is invalid.");
  }
  return ({ x, y }, attacksRight) => {
    requireValue(Number.isFinite(x) && Number.isFinite(y) && typeof attacksRight === "boolean", "EPV lookup needs finite coordinates and an attack direction.");
    if (x < 0 || x > pitch.length || y < 0 || y > pitch.width) return 0;
    const col = Math.min(columns - 1, Math.floor(x / pitch.length * columns));
    // FoT uses center-origin metres with positive y toward the top touchline.
    const row = Math.min(rows - 1, Math.floor((1 - y / pitch.width) * rows));
    return grid[row][attacksRight ? col : columns - 1 - col];
  };
}

export function buildMomentum(match, possessionValue) {
  requireValue(Number.isFinite(match.matchEndSeconds) && match.matchEndSeconds >= 0 && match.matchEndSeconds <= 4 * 3600
    && Array.isArray(match.events) && typeof possessionValue === "function"
    && typeof match.homeAttacksRightFirstHalf === "boolean", "Momentum needs valid match timing, events and an EPV lookup.");
  const bins = new Array(Math.floor(match.matchEndSeconds / MOMENTUM_BIN_SECONDS) + 1).fill(0);
  for (const { team, period, time, location } of match.events) {
    requireValue(["HOME", "AWAY"].includes(team) && [1, 2].includes(period)
      && Number.isFinite(time) && time >= 0 && time <= match.matchEndSeconds, "Momentum events need a known team/period and a time inside the match.");
    // Event endpoints may be beyond a touchline/goal line; the grid values them at zero.
    requireValue(location && Number.isFinite(location.x) && Number.isFinite(location.y), "Event location needs finite coordinates.");
    const home = team === "HOME";
    const homeAttacksRight = period === 1 ? match.homeAttacksRightFirstHalf : !match.homeAttacksRightFirstHalf;
    const value = possessionValue(location, home ? homeAttacksRight : !homeAttacksRight);
    requireValue(Number.isFinite(value) && value >= 0, "EPV must be finite and nonnegative.");
    bins[Math.floor(time / MOMENTUM_BIN_SECONDS)] += (home ? 1 : -1) * value;
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
      requireValue(Number.isFinite(value) && value >= 0, "EPV must be finite and nonnegative.");
      closest = Math.min(closest, ballDistance);
      reachable += Number(ballDistance <= REACH_METRES);
      actionFrames += 1;
      peakValue = Math.max(peakValue, value);
      accessibleValue = Math.max(accessibleValue, value * clamp01(1 - ballDistance / VALUE_RADIUS_METRES));
    }
  }
  requireValue(actionFrames > 0, "No tracking frames cover this action window.");
  return {
    coverError: totalDistance / frames.length,
    closest,
    reachPercent: 100 * reachable / actionFrames,
    accessibleValue: 100 * accessibleValue,
    accessRatio: peakValue ? accessibleValue / peakValue : 0,
  };
}

export function analyzeScenario({ match, momentId, simulation, possessionValue }) {
  const moment = validateMoment(match, momentId);
  requireValue(simulation && typeof possessionValue === "function", "Simulation results and an EPV lookup are required.");
  const { baselineFrames, alternativeFrames, outgoingPlayerId, incomingPlayerId, tacticalPoints } = simulation;
  requireValue(outgoingPlayerId === moment.targetPlayerId && moment.candidatePlayerIds.includes(incomingPlayerId), "Simulation players do not match this scenario.");
  requireValue(Array.isArray(baselineFrames) && Array.isArray(alternativeFrames) && Array.isArray(tacticalPoints)
    && baselineFrames.length === moment.frames.length && alternativeFrames.length === baselineFrames.length
    && tacticalPoints.length === baselineFrames.length, "Simulation and tactical-point lengths must match the recorded scenario.");
  for (let index = 0; index < baselineFrames.length; index += 1) {
    const baseline = baselineFrames[index];
    const alternative = alternativeFrames[index];
    const recorded = moment.frames[index];
    requireValue(baseline.time === recorded.time && baseline.sourceFrame === recorded.sourceFrame
      && alternative.time === recorded.time && alternative.sourceFrame === recorded.sourceFrame, "Comparison frames must share recorded timestamps.");
    validatePoint(baseline.players?.[outgoingPlayerId], match.pitch, "Original player");
    validatePoint(alternative.players?.[incomingPlayerId], match.pitch, "Replacement player");
    validatePoint(baseline.ball, match.pitch, "Original ball");
    validatePoint(alternative.ball, match.pitch, "Alternative ball");
    validatePoint(tacticalPoints[index], match.pitch, "Tactical point");
  }
  const { action, context } = moment;
  const { role, point, window, end, reach, cue, task } = contexts[context];
  const recordedPlayer = match.players.find(({ id }) => id === outgoingPlayerId).displayName;
  const homeHasBall = action.team === "HOME";
  const ballTeam = homeHasBall ? "Home" : "Away";
  requireValue(typeof match.homeAttacksRightFirstHalf === "boolean", "The attacking direction is required.");
  const homeAttacksRight = (moment.period ?? 1) === 1 ? match.homeAttacksRightFirstHalf : !match.homeAttacksRightFirstHalf;
  const ballTeamAttacksRight = homeHasBall ? homeAttacksRight : !homeAttacksRight;
  const summarizeBranch = (frames, playerId) => summarize(frames, playerId, tacticalPoints, action,
    ballTeamAttacksRight, possessionValue);
  const original = summarizeBranch(baselineFrames, outgoingPlayerId);
  const candidate = summarizeBranch(alternativeFrames, incomingPlayerId);
  const metric = (id, label, unit, better, explanation) => ({
    id, label, unit, better, explanation, baseline: original[id], alternative: candidate[id],
    delta: Number((candidate[id] - original[id]).toFixed(2)),
  });
  const baselineFit = scoreBranch(original);
  const alternativeFit = scoreBranch(candidate);
  const fit = alternativeFit.components;
  const { score, title } = alternativeFit;
  const scoreDelta = score - baselineFit.score;
  const decision = scoreDelta >= 3 ? "Review replacement" : scoreDelta <= -3 ? "Retain recorded player" : "No clear improvement";

  const comparison = candidate.closest <= original.closest
    ? `The modeled profile closed to the ball at least as closely as ${recordedPlayer}. Review whether it can still ${task}.`
    : `${recordedPlayer} got closer to the ball. Coach the replacement to react to ${cue} and ${task}.`;
  const reachEvidence = candidate.reachPercent === 0
    ? `The replacement stayed outside 1.6 m reach before the recorded ${end}.`
    : `The replacement was within 1.6 m on ${candidate.reachPercent.toFixed(1)}% of frames in the ${window}.`;
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
      decision,
      reasoning: [
        `${comparison} Closest approach was ${candidate.closest.toFixed(1)} m for the replacement and ${original.closest.toFixed(1)} m for ${recordedPlayer}.`,
        reachEvidence,
        `Home's ${role} role awards ${fit.cover.toFixed(1)}/40 for positioning, ${fit.access.toFixed(1)}/40 for access to the ball, and ${fit.value.toFixed(1)}/20 for possession-value access.`,
        `${decision}: the same rubric scores the recorded player ${baselineFit.score}/100 and the replacement ${score}/100 (${scoreDelta >= 0 ? "+" : ""}${scoreDelta} points). A difference below 3 points is treated as inconclusive.`,
        `Positioning error changed by ${(candidate.coverError - original.coverError).toFixed(2)} m (lower is better); reachable EPV changed by ${(candidate.accessibleValue - original.accessibleValue).toFixed(2)} EPV × 100 (higher is better). These measures can disagree.`,
      ],
      caveat: `The candidate profiles are hypothetical. This one-clip score describes fit for Home's assigned ${role} role.`,
    },
    assumptions: simulation.assumptions,
    scouting: { baseline: baselineFit, alternative: alternativeFit, scoreDelta, decision,
      context: moment.context, scope: "one scenario / assigned role", ageUsedInScore: false },
    confidence: { level: "low", observed: ["recorded tracking", "match events"],
      modeled: ["replacement trajectory", "candidate age and traits", "tactical target"],
      unknown: ["ball height", "successful control", "real candidate ability"] },
    qualityLabel: "Low confidence · One clip · Assumed player attributes",
  };
}

function scoreBranch(summary) {
  const components = { cover: 40 * clamp01(1 - summary.coverError / 12),
    access: 40 * clamp01(1 - summary.closest / 6), value: 20 * summary.accessRatio };
  const score = Math.round(components.cover + components.access + components.value);
  const title = score >= 85 ? "Must-have candidate" : score >= 70 ? "Strong prospect"
    : score >= 50 ? "Possible fit" : "Low fit";
  return { score, title, components };
}

export const methodology = {
  version: "1.0.0",
  metrics: {
    coverError: "Arithmetic mean distance to the modeled tactical target across recorded samples (metres).",
    closest: "Minimum ball distance during action.startFrame <= sourceFrame < action.endFrame (metres).",
    reachPercent: "100 × action samples within 1.6 metres / all action samples. A geometric proxy, not possession.",
    accessibleValue: "100 × max(ball-location EPV × max(0, 1 - player-ball distance / 4 metres)) in the action window.",
  },
  score: { positioning: "40 × clamp(1 - coverError/12, 0, 1)",
    ballAccess: "40 × clamp(1 - closest/6, 0, 1)", value: "20 × accessibleEPV/peakBallEPV; zero when peak EPV is zero",
    thresholds: { mustHave: 85, strongProspect: 70, possibleFit: 50 }, inconclusiveDifferencePoints: 3,
    limitation: "Heuristic role suitability, not a calibrated probability or overall player rating. Age receives no bonus." },
  momentum: "Sum EPV at recorded pass destinations and shot locations in 60-second bins, Home minus Away; trailing three bins, divided by peak absolute rolling value. First/second-half attack directions are reversed. Not xG or goal probability.",
  aggregation: "Equal weight per compatible scenario, grouped by context. Never pool different roles into one overall score.",
};
