import { requireValue } from "../domain/validation.js";

const clamp = (value) => Math.max(-1, Math.min(1, value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const normalizedPoint = (point) => point && finite(point.x) && finite(point.y)
  && point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100;

function spatialBalance(frame, teamByPlayer, pitch, homeId, awayId) {
  requireValue(normalizedPoint(frame.ball), "Momentum requires a finite recorded/simulated ball position.");
  const homeWeights = [], awayWeights = [];
  for (const [id, position] of Object.entries(frame.players)) {
    const team = teamByPlayer.get(id);
    requireValue(normalizedPoint(position) && (team === homeId || team === awayId),
      "Momentum requires known team identities and complete player positions.");
    const distanceM = Math.hypot((position.x - frame.ball.x) * pitch.length / 100,
      (position.y - frame.ball.y) * pitch.width / 100);
    const pressure = Math.exp(-distanceM / 8);
    if (team === homeId) homeWeights.push(pressure);
    else awayWeights.push(pressure);
  }
  // Summing in value order makes an identity-only no-op exactly invariant to
  // object insertion order when an outgoing ID is replaced by a candidate ID.
  const sum = (values) => values.sort((a, b) => a - b).reduce((total, value) => total + value, 0);
  const home = sum(homeWeights), away = sum(awayWeights);
  requireValue(home > 0 && away > 0, "Momentum requires players from both match teams.");
  return clamp((home - away) / (home + away));
}

/** Trailing one-second integration: each sampled value is held until the next timestamp.
 * The first point uses its own raw value; later points never read a future frame.
 */
function smooth(times, values) {
  const prefix = [0];
  for (let i = 1; i < times.length; i++) {
    prefix.push(prefix[i - 1] + values[i - 1] * (times[i] - times[i - 1]));
  }
  let left = 0;
  return times.map((time, i) => {
    const from = Math.max(times[0], time - 1);
    while (left + 1 <= i && times[left + 1] <= from) left++;
    if (time === from) return values[i];
    const startIntegral = prefix[left] + values[left] * (from - times[left]);
    return clamp((prefix[i] - startIntegral) / (time - from));
  });
}

function timeMean(times, values) {
  let integral = 0;
  for (let i = 1; i < times.length; i++) integral += (values[i - 1] + values[i]) / 2 * (times[i] - times[i - 1]);
  return integral / (times.at(-1) - times[0]);
}

/** Compare only the exact normalized frames returned by a saved replay execution.
 * This does not alter frames, fit player abilities or extrapolate the clip.
 */
export function buildGhostMomentum({ matchId, scenarioId, pitch, teams, players, originalFrames, branches, window }) {
  requireValue(pitch && finite(pitch.length) && pitch.length > 0 && finite(pitch.width) && pitch.width > 0,
    "Momentum requires the source pitch dimensions in metres.");
  requireValue(Array.isArray(teams) && teams.length === 2 && teams[0].id !== teams[1].id
    && teams.every((team) => typeof team.id === "string" && typeof team.name === "string"),
    "Momentum requires distinct home and away team identities.");
  requireValue(Array.isArray(originalFrames) && originalFrames.length >= 2 && originalFrames[0].timeSec === 0,
    "Momentum requires a complete source clip starting at relative time zero.");
  const times = originalFrames.map((frame) => frame.timeSec);
  requireValue(times.every((time, i) => finite(time) && (i === 0 || time > times[i - 1])),
    "Momentum frame times must strictly increase.");
  requireValue(window && Number.isInteger(window.period) && window.period >= 1 && window.period <= 4
    && [window.startPeriodTimeSec, window.startMatchTimeSec, window.startElapsedTimeSec].every((time) => finite(time) && time >= 0),
    "Momentum requires explicit period, match-clock and elapsed-clock anchors.");
  const homeTeam = { id: teams[0].id, name: teams[0].name };
  const awayTeam = { id: teams[1].id, name: teams[1].name };
  const teamByPlayer = new Map(players.map((player) => [player.id, player.teamId]));
  const originalIds = Object.keys(originalFrames[0].players).sort();
  const sameIds = (frame, ids) => {
    const actual = Object.keys(frame.players).sort();
    return actual.length === ids.length && actual.every((id, index) => id === ids[index]);
  };
  requireValue(originalFrames.every((frame) => sameIds(frame, originalIds)), "Momentum source lineup must remain stable within the clip.");
  const original = smooth(times, originalFrames.map((frame) => spatialBalance(frame, teamByPlayer, pitch, homeTeam.id, awayTeam.id)));
  const originalMean = timeMean(times, original);
  const seenBranches = new Set();
  requireValue(Array.isArray(branches) && branches.length > 0, "Momentum requires at least one replay branch.");
  const comparisons = branches.map((branch) => {
    requireValue(typeof branch.id === "string" && !seenBranches.has(branch.id), "Momentum branch IDs must be distinct.");
    seenBranches.add(branch.id);
    const branchTeams = new Map(teamByPlayer), expected = new Set(originalIds);
    for (const replacement of branch.replacements) {
      requireValue(expected.has(replacement.originalPlayerId) && !expected.has(replacement.candidatePlayerId),
        "Momentum replacements must refer to distinct active outgoing players.");
      const team = teamByPlayer.get(replacement.originalPlayerId);
      // A candidate plays for the outgoing player's side in this scenario,
      // regardless of their historical club or roster membership.
      branchTeams.set(replacement.candidatePlayerId, team);
      expected.delete(replacement.originalPlayerId);
      expected.add(replacement.candidatePlayerId);
    }
    const expectedIds = [...expected].sort();
    requireValue(branch.frames.length === originalFrames.length && branch.frames.every((frame, i) => frame.timeSec === times[i] && sameIds(frame, expectedIds)),
      "Momentum branches must use exactly the source clip timestamps and replacement lineup.");
    const ghost = smooth(times, branch.frames.map((frame) => spatialBalance(frame, branchTeams, pitch, homeTeam.id, awayTeam.id)));
    const points = times.map((timeSec, i) => ({ timeSec,
      matchTimeSec: window.startMatchTimeSec + timeSec, elapsedTimeSec: window.startElapsedTimeSec + timeSec,
      original: original[i], ghost: ghost[i], delta: ghost[i] - original[i] }));
    const ghostMean = timeMean(times, ghost);
    const peakDelta = points.reduce((peak, point) => Math.abs(point.delta) > Math.abs(peak) ? point.delta : peak, 0);
    return { branchId: branch.id, points, summary: { originalMean, ghostMean, delta: ghostMean - originalMean, peakDelta } };
  });
  return { kind: "SIMULATED", matchId, scenarioId, metric: "spatial_momentum",
    window: { period: window.period, startPeriodTimeSec: window.startPeriodTimeSec,
      startMatchTimeSec: window.startMatchTimeSec, startElapsedTimeSec: window.startElapsedTimeSec,
      durationSec: times.at(-1) - times[0] }, homeTeam, awayTeam,
    methodology: "Home-positive local spatial proxy: sum exp(-distance-to-ball / 8 metres) for each team, then (home-away)/(home+away). Exact returned replay coordinates are converted from 0–100 to source-pitch metres. Each curve uses a causal trailing one-second time-weighted mean with prior samples held until the next timestamp; the first point uses its raw value. Clip means use trapezoidal time weighting of the displayed samples. Peak delta retains the sign of the largest absolute change. Candidates inherit the outgoing player's scenario team.",
    limitations: [
      "Only the simulated clip is compared. No full-match momentum or event series is projected or changed.",
      "Spatial ball access is an uncalibrated geometric proxy, not possession, event EPV, xG, goal probability or a predicted match result.",
      "The ball and unchanged players follow their returned replay paths. Source-extrapolated coordinates and shared movement assumptions remain limitations.",
      ...(window.clockLimitations ?? []),
    ], branches: comparisons };
}
