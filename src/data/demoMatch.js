/**
 * GhostXI synthetic demo match: data module (Prompt B; this file is the data owner's only file).
 *
 * getDemoMatch() returns the shared Match contract from Prompts/00_START_HERE.md with three short,
 * fully synthetic scenarios: press, transition and attack. SYNTHETIC DEMO DATA: no real match,
 * player or rating. Names are anonymous shirt labels, traits are illustrative 0–100 values, and none
 * of the events happened.
 *
 * Conventions
 * - Metres on a 105 × 68 m pitch. x runs from Home's goal (0) to Away's goal (105); y runs from the
 *   top touchline (0) to the bottom one (68), as drawn on the canvas. Home attacks left to right in
 *   every scenario, so Home's right flank is the bottom of the pitch (high y).
 * - One frame every 0.5 s. Only the 22 starters are tracked; a reserve first appears when the
 *   simulation models a substitution.
 *
 * How movement is generated (deterministic formulas, no randomness)
 * - Every scenario starts from an explicit formation: Home 4-3-3, Away 4-4-2.
 * - Players involved in the action follow scripted waypoints, interpolated linearly.
 * - The ball sits 0.8 m in front of its holder, or travels in a straight line between holders.
 * - Everyone else keeps their formation slot and slides with the ball (across and up or down the
 *   pitch), drops 5 m when their team loses the ball and pushes up 5 m when it wins it, with a
 *   reaction lag and a 6.5 m/s cap. Outfield players never drop behind their own goal-area line.
 * - Speeds and spacing were checked against the open Metrica Sports Sample Data, Game 1
 *   (https://github.com/metrica-sports/sample-data). Over 0.5 s windows its 90th-percentile player
 *   speed is 6.5 m/s and its peak 8.8 m/s; outfield teams span about 32 m across and 37–49 m deep.
 */

const PITCH = { length: 105, width: 68 };
const FRAME_STEP_SEC = 0.5;
const TEAMS = ["HOME", "AWAY"];
const ROLES = ["GK", "DEF", "MID", "FWD"];
const CONTEXTS = ["press", "transition", "attack"];
const TRAIT_KEYS = ["pace", "positioning", "defending", "passing", "stamina"];
const MAX_PLAYER_SPEED = 9; // m/s, just above the Metrica sample's 8.8 m/s peak
const MAX_BALL_SPEED = 32; // m/s, a hard shot

const BALL_OFFSET = 0.8; // m in front of the holder, toward the goal the holder attacks
const OFF_BALL_MAX_SPEED = 6.5; // m/s, about the Metrica sample's 90th percentile
const OFF_BALL_RESPONSE = 0.6; // share of the gap to the target closed per frame (reaction lag)
const POSSESSION_DEPTH = 5; // m a block pushes up after winning the ball or drops after losing it
const IN_POSSESSION_WIDTH = 0.6; // a team on the ball follows it across less, keeping its width
const GOAL_AREA_DEPTH = 5.5; // m; off-ball outfield players never drop behind their own goal-area line
const BLOCK_FOLLOW = { // share of the ball's displacement an off-ball player follows
  GK: { x: 0.1, y: 0.2 },
  DEF: { x: 0.4, y: 0.45 },
  MID: { x: 0.45, y: 0.45 },
  FWD: { x: 0.35, y: 0.3 },
};

// [id, team, shirt, position, role, age, [pace, positioning, defending, passing, stamina]]
// Illustrative 0–100 traits, not measured ratings.
const STARTERS = [
  // Home 4-3-3, attacking toward x = 105.
  ["H1", "HOME", 1, "goalkeeper", "GK", 30, [46, 77, 60, 58, 62]],
  ["H2", "HOME", 2, "right-back", "DEF", 27, [78, 62, 66, 76, 76]],
  ["H3", "HOME", 3, "left-back", "DEF", 25, [74, 66, 70, 68, 78]],
  ["H4", "HOME", 4, "right centre-back", "DEF", 29, [62, 78, 82, 64, 70]],
  ["H5", "HOME", 5, "left centre-back", "DEF", 24, [66, 74, 79, 70, 72]],
  ["H6", "HOME", 6, "defensive midfielder", "MID", 28, [60, 79, 77, 74, 80]],
  ["H7", "HOME", 7, "right winger", "FWD", 31, [66, 78, 45, 84, 55]],
  ["H8", "HOME", 8, "right central midfielder", "MID", 29, [64, 70, 80, 66, 74]],
  ["H9", "HOME", 9, "striker", "FWD", 27, [76, 80, 40, 66, 72]],
  ["H10", "HOME", 10, "left central midfielder", "MID", 26, [68, 76, 58, 84, 76]],
  ["H11", "HOME", 11, "left winger", "FWD", 23, [84, 70, 48, 72, 78]],
  // Away 4-4-2, attacking toward x = 0.
  ["A1", "AWAY", 1, "goalkeeper", "GK", 33, [44, 80, 62, 56, 58]],
  ["A2", "AWAY", 2, "right-back", "DEF", 26, [76, 68, 70, 66, 78]],
  ["A3", "AWAY", 3, "left-back", "DEF", 28, [72, 66, 72, 64, 74]],
  ["A4", "AWAY", 4, "right centre-back", "DEF", 30, [60, 80, 84, 60, 68]],
  ["A5", "AWAY", 5, "left centre-back", "DEF", 25, [68, 72, 78, 72, 74]],
  ["A6", "AWAY", 6, "right central midfielder", "MID", 27, [70, 74, 76, 72, 80]],
  ["A7", "AWAY", 7, "right midfielder", "MID", 22, [82, 68, 58, 70, 80]],
  ["A8", "AWAY", 8, "left central midfielder", "MID", 24, [66, 72, 64, 80, 78]],
  ["A9", "AWAY", 9, "striker", "FWD", 29, [80, 78, 38, 64, 70]],
  ["A10", "AWAY", 10, "second striker", "FWD", 21, [78, 74, 42, 74, 74]],
  ["A11", "AWAY", 11, "left midfielder", "MID", 26, [86, 70, 52, 72, 76]],
];

// Home reserves: the same three hypothetical profiles as src/simulation/alternative.js, with the
// contract's role codes. [id, displayName, role, age, traits]
const RESERVES = [
  ["lane-reader", "Lane reader · central midfielder", "MID", 19, [70, 84, 75, 82, 78]], // creative, reads passing lanes
  ["patient-cover", "Patient cover · full-back", "DEF", 22, [50, 79, 88, 62, 74]], // defensive, slower
  ["wide-runner", "Wide runner · winger", "FWD", 20, [90, 74, 60, 73, 84]], // fast, less defensive
];

// Each scenario: an explicit formation for all 22 starters ([x, y] in metres at t = 0), scripted
// runs ([t, x, y] waypoints after t = 0, ending at durationSec) for the players in the action, and a
// ball timeline. { holder, until } keeps the ball at a player's feet until `until`; { pass | shot,
// until } sends it in a straight line from the previous holder to that player, arriving at `until`.
const SCENARIOS = [
  {
    id: "home-high-press",
    title: "Home presses the build-up",
    description: "Synthetic scenario. Away plays out from the goalkeeper to the left centre-back. "
      + "Home #7 sprints to close him down from the outside and blocks the pass down the line, so the "
      + "ball goes inside, where Home #8 steps in and wins it. Home attacks left to right.",
    startClock: "64:18",
    durationSec: 10,
    context: "press",
    targetPlayerId: "H7",
    candidatePlayerIds: ["wide-runner", "lane-reader"],
    formation: {
      H1: [18, 34], H2: [60, 52], H3: [60, 15], H4: [56, 40], H5: [56, 27], H6: [67, 34],
      H7: [81, 49], H8: [74, 43], H9: [88, 35], H10: [75, 26], H11: [85, 19],
      A1: [101.5, 33.5], A2: [85, 12], A3: [84, 57], A4: [93, 23], A5: [93, 44], A6: [80, 29],
      A7: [68, 13], A8: [77, 40], A9: [59, 31], A10: [60, 40], A11: [67, 56],
    },
    runs: {
      A1: [[1, 101.2, 34.2], [2, 100.6, 35.2], [5, 100.2, 36.2], [10, 101, 35]],
      A5: [[2, 92.4, 47.5], [3, 91.2, 47], [3.5, 90.6, 46.6], [5, 89.8, 44.6], [6, 90.6, 42.6],
        [7, 91.8, 39.2], [8.5, 92.8, 36.4], [10, 93.2, 34]],
      H7: [[1, 81.6, 49.3], [2, 86.6, 50], [3, 89.6, 49], [3.5, 90, 48], [4.5, 88.8, 46],
        [6, 89.4, 43.4], [7.5, 92, 43.6], [10, 95.4, 44.6]],
      A8: [[3.5, 80, 41.4], [4.5, 82.4, 42.4], [5, 82.6, 42], [6, 81.6, 40.6], [8, 85, 38.6], [10, 88, 37.2]],
      H8: [[3.5, 78.6, 43], [4.5, 81.4, 42.8], [5, 81.9, 42.4], [6, 84.4, 41], [7, 86.4, 40.6], [10, 90.4, 41.4]],
      H9: [[1, 88.5, 35.4], [2, 89.4, 37], [3.5, 89.8, 38.2], [5, 89.2, 36.4], [7, 89.8, 33.6],
        [8, 91, 32.9], [9, 92, 32.2], [10, 92.8, 31.6]],
      A4: [[5, 91.6, 26.4], [7, 91, 30.4], [10, 92, 31]],
    },
    ball: [
      { holder: "A1", until: 1 },
      { pass: "A5", until: 2 },
      { holder: "A5", until: 3.5 },
      { pass: "A8", until: 4.5 },
      { holder: "A8", until: 5 },
      { holder: "H8", until: 6 }, // Home #8 tackles at 5 s
      { pass: "H9", until: 7 },
      { holder: "H9", until: 10 },
    ],
  },
  {
    id: "away-counter-right",
    title: "Away counter-attacks down Home's right",
    description: "Synthetic scenario. Home loses the ball in midfield while right-back Home #2 is high "
      + "up the pitch. Away's left midfielder runs into the space behind him and cuts the ball back "
      + "for the striker as Home #2 sprints back. Home attacks left to right.",
    startClock: "71:05",
    durationSec: 10,
    context: "transition",
    targetPlayerId: "H2",
    candidatePlayerIds: ["patient-cover", "wide-runner"],
    formation: {
      H1: [24, 34], H2: [70, 56], H3: [62, 13], H4: [49, 42], H5: [49, 26], H6: [58, 33],
      H7: [79, 52], H8: [69, 44], H9: [83, 36], H10: [66, 29], H11: [80, 17],
      A1: [100, 34], A2: [85, 19], A3: [84, 50], A4: [87, 29], A5: [87, 40], A6: [72, 31],
      A7: [74, 18], A8: [73, 40], A9: [59, 38], A10: [61, 28], A11: [66, 53],
    },
    runs: {
      H10: [[0.5, 66.6, 29.4], [1.5, 66, 30.6], [3, 62.5, 32], [5, 56, 34.5], [7, 49, 36], [10, 40, 37.5]],
      A6: [[1, 72.4, 31.6], [2, 69.5, 34], [3, 67.5, 36], [6, 58, 40], [10, 45, 42]],
      A11: [[1, 65.4, 53.6], [2, 61.2, 55.6], [3.5, 52.8, 57], [5, 44.6, 56], [6.5, 36.2, 54.2],
        [8, 27.8, 50.4], [9, 25, 49.6], [10, 23.4, 48.2]],
      H2: [[1, 70.2, 56.4], [2, 67.2, 57.4], [3.5, 59.2, 57.6], [5, 50, 57], [6.5, 40.8, 55.4],
        [8, 31.6, 52.6], [9, 27, 49.6], [10, 24.6, 46.4]],
      A9: [[2, 57.6, 38.6], [3.5, 51.6, 40], [5, 44.2, 40.6], [6.5, 36.6, 40.4], [8, 26.6, 39.4],
        [9, 20, 38], [10, 18.8, 37.4]],
      H4: [[2, 48.2, 43.4], [3.5, 45.4, 45.6], [5, 41, 47.6], [6.5, 35.2, 48.6], [8, 29.4, 47.8],
        [9, 26, 45.4], [10, 23.6, 43]],
      H5: [[2, 48.6, 29.6], [3.5, 46.6, 32.6], [5, 42.6, 35.2], [6.5, 36.8, 36.8], [8, 29.2, 37.4],
        [9, 22.6, 37], [10, 20.2, 37]],
      H1: [[3.5, 20, 35], [6.5, 13, 36.4], [8.5, 7.6, 37.2], [10, 5.2, 37]],
    },
    ball: [
      { holder: "H10", until: 0.5 },
      { pass: "A6", until: 1 }, // intercepted
      { holder: "A6", until: 2 },
      { pass: "A11", until: 3.5 },
      { holder: "A11", until: 8 },
      { pass: "A9", until: 9 },
      { holder: "A9", until: 10 },
    ],
  },
  {
    id: "home-right-side-attack",
    title: "Home attacks down the right",
    description: "Synthetic scenario. Home #8 receives in the right half-space, slips the ball behind "
      + "the full-back for winger Home #7 and runs on to the edge of the box in support. #7 cuts it back "
      + "and the striker's first-time shot is saved. Home attacks left to right.",
    startClock: "78:42",
    durationSec: 9,
    context: "attack",
    targetPlayerId: "H8",
    candidatePlayerIds: ["lane-reader", "wide-runner"],
    formation: {
      H1: [20, 34], H2: [66, 54], H3: [62, 14], H4: [47, 41], H5: [47, 27], H6: [60, 33],
      H7: [80, 56], H8: [70, 44], H9: [85, 36], H10: [72, 25], H11: [84, 15],
      A1: [101, 34], A2: [88, 20], A3: [86, 51], A4: [90, 30], A5: [90, 40], A6: [79, 31],
      A7: [76, 19], A8: [78, 40], A9: [64, 37], A10: [66, 28], A11: [76, 50],
    },
    runs: {
      H6: [[1, 61.8, 33.6], [3, 64.4, 35.4], [6, 70, 37], [9, 73, 37.4]],
      H8: [[1, 70.8, 43.6], [2, 71.6, 43], [3, 73, 42.6], [4.5, 77.6, 42.4], [6, 83.2, 41.6],
        [7, 86.8, 41.2], [9, 89, 40.6]],
      H7: [[1.5, 81.4, 55.6], [3, 83.6, 55], [4.5, 91.8, 54.4], [6, 98.6, 50], [7, 99.4, 49], [9, 98.8, 47.2]],
      H9: [[3, 86.6, 37], [4.5, 89.4, 38.2], [6, 92, 39.4], [7, 93.6, 40], [8, 95.2, 39.4], [9, 95.8, 39]],
      A1: [[4.5, 101.6, 35.8], [6, 102.6, 38.2], [7, 103, 39], [7.5, 103.2, 38.4], [9, 102.4, 37]],
      A3: [[3, 86.6, 52], [4.5, 90.6, 52.8], [6, 96.8, 50.8], [7, 98.2, 49.2], [9, 97.8, 48]],
      A5: [[4.5, 92.8, 42.8], [6, 95.6, 44], [7, 96.4, 42.4], [9, 97, 41.2]],
      A4: [[4.5, 91.8, 34], [6, 93.8, 36.6], [7, 94.8, 38.2], [9, 96.2, 38]],
      A8: [[3, 79.4, 41.6], [6, 84.4, 41], [7, 85.8, 40.6], [9, 87.4, 40.2]],
    },
    ball: [
      { holder: "H6", until: 1 },
      { pass: "H8", until: 2 },
      { holder: "H8", until: 3 },
      { pass: "H7", until: 4.5 },
      { holder: "H7", until: 6 },
      { pass: "H9", until: 7 },
      { shot: "A1", until: 7.5 }, // first-time shot, saved
      { holder: "A1", until: 9 },
    ],
  },
];

/**
 * Returns the synthetic demo Match. Every call builds the same data from scratch, so callers can
 * modify their copy freely. The result is validated before it is returned.
 */
export function getDemoMatch() {
  const players = [
    ...STARTERS.map(([id, team, shirt, position, role, age, traits]) => createPlayer(
      id, `${team === "HOME" ? "Home" : "Away"} #${shirt} · ${position}`, team, role, age, traits,
    )),
    ...RESERVES.map(([id, displayName, role, age, traits]) => createPlayer(id, displayName, "HOME", role, age, traits)),
  ];
  const lineup = {
    home: STARTERS.filter(([, team]) => team === "HOME").map(([id]) => id),
    away: STARTERS.filter(([, team]) => team === "AWAY").map(([id]) => id),
  };
  const teamOf = new Map(players.map(({ id, team }) => [id, team]));
  const roleOf = new Map(players.map(({ id, role }) => [id, role]));
  const starters = [...lineup.home, ...lineup.away];

  return validateMatch({
    id: "ghostxi-synthetic-demo",
    name: "Synthetic demo · Home vs Away",
    dataKind: "synthetic",
    pitch: { ...PITCH },
    players,
    lineup,
    moments: SCENARIOS.map((scenario) => buildMoment(scenario, { teamOf, roleOf, starters })),
  });
}

/**
 * Checks a Match against the shared contract and the demo's data rules. Returns the match when it
 * is valid; otherwise throws an Error listing every problem (also available as `error.problems`).
 */
export function validateMatch(match) {
  const problems = [];
  const report = (message) => problems.push(message);
  const isPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
  const inBounds = ({ x, y }) => x >= 0 && x <= PITCH.length && y >= 0 && y <= PITCH.width;

  if (match?.dataKind !== "synthetic") report(`dataKind must be "synthetic" (got ${JSON.stringify(match?.dataKind)})`);
  if (match?.pitch?.length !== PITCH.length || match?.pitch?.width !== PITCH.width) {
    report(`pitch must be ${PITCH.length} × ${PITCH.width} m`);
  }

  const players = new Map();
  for (const [index, player] of (match?.players ?? []).entries()) {
    if (typeof player?.id !== "string" || !player.id) {
      report(`players[${index}] has no id`);
      continue;
    }
    const who = `player '${player.id}'`;
    if (players.has(player.id)) report(`duplicate player id '${player.id}'`);
    players.set(player.id, player);
    if (typeof player.displayName !== "string" || !player.displayName.trim()) report(`${who} has no displayName`);
    if (!TEAMS.includes(player.team)) report(`${who}: team must be ${TEAMS.join(" or ")}`);
    if (!ROLES.includes(player.role)) report(`${who}: role must be one of ${ROLES.join(", ")}`);
    if (!Number.isInteger(player.age) || player.age < 15 || player.age > 45) report(`${who}: age must be a whole number of years`);
    for (const key of TRAIT_KEYS) {
      const value = player.traits?.[key];
      if (!Number.isFinite(value) || value < 0 || value > 100) report(`${who}: trait '${key}' must be 0–100 (got ${value})`);
    }
  }

  const active = new Map();
  for (const [side, team] of [["home", "HOME"], ["away", "AWAY"]]) {
    const ids = match?.lineup?.[side];
    if (!Array.isArray(ids) || ids.length !== 11) {
      report(`lineup.${side} must list 11 players`);
      continue;
    }
    for (const id of ids) {
      if (!players.has(id)) report(`lineup.${side}: unknown player '${id}'`);
      else if (players.get(id).team !== team) report(`lineup.${side}: '${id}' is not a ${team} player`);
      if (active.has(id)) report(`lineup: '${id}' is listed twice`);
      active.set(id, team);
    }
    if (ids.filter((id) => players.get(id)?.role === "GK").length !== 1) report(`lineup.${side} needs exactly one goalkeeper`);
  }

  const momentIds = new Set();
  for (const moment of match?.moments ?? []) {
    const where = `moment '${moment?.id}'`;
    if (typeof moment?.id !== "string" || !moment.id || momentIds.has(moment.id)) report(`${where}: id must be unique and non-empty`);
    momentIds.add(moment?.id);
    for (const field of ["title", "description"]) {
      if (typeof moment?.[field] !== "string" || !moment[field].trim()) report(`${where}: ${field} is empty`);
    }
    if (!/^\d{1,3}:[0-5]\d$/.test(moment?.startClock ?? "")) report(`${where}: startClock must look like '70:12'`);
    if (!CONTEXTS.includes(moment?.context)) report(`${where}: context must be one of ${CONTEXTS.join(", ")}`);
    if (!Number.isFinite(moment?.durationSec) || moment.durationSec < 5 || moment.durationSec > 15) {
      report(`${where}: durationSec must be 5–15 s`);
    }

    if (!players.has(moment?.targetPlayerId)) report(`${where}: targetPlayerId '${moment?.targetPlayerId}' does not exist`);
    else if (active.get(moment.targetPlayerId) !== "HOME") report(`${where}: target '${moment.targetPlayerId}' is not an active HOME player`);
    if (!Array.isArray(moment?.candidatePlayerIds) || moment.candidatePlayerIds.length === 0) {
      report(`${where}: candidatePlayerIds must list at least one reserve`);
    }
    for (const id of moment?.candidatePlayerIds ?? []) {
      if (!players.has(id)) report(`${where}: candidate '${id}' does not exist`);
      else if (players.get(id).team !== "HOME") report(`${where}: candidate '${id}' is not a HOME player`);
      else if (active.has(id)) report(`${where}: candidate '${id}' is already on the pitch; candidates must be reserves`);
    }

    const frames = moment?.frames;
    if (!Array.isArray(frames) || frames.length < 2) {
      report(`${where}: needs at least two frames`);
      continue;
    }
    const expectedFrames = Math.round(moment.durationSec / FRAME_STEP_SEC) + 1;
    if (frames.length !== expectedFrames) report(`${where}: expected ${expectedFrames} frames (one every ${FRAME_STEP_SEC} s), got ${frames.length}`);
    frames.forEach((frame, index) => {
      const at = `${where} at t=${frame?.time}s`;
      if (Math.abs(frame?.time - index * FRAME_STEP_SEC) > 1e-9) report(`${where}: frame ${index} should be at t=${index * FRAME_STEP_SEC}s`);
      for (const id of active.keys()) {
        const point = frame?.players?.[id];
        if (!point) report(`${at}: missing player '${id}'`);
        else if (!isPoint(point)) report(`${at}: player '${id}' has non-numeric coordinates`);
        else if (!inBounds(point)) report(`${at}: player '${id}' is out of bounds (${point.x}, ${point.y})`);
      }
      for (const id of Object.keys(frame?.players ?? {})) {
        if (!active.has(id)) report(`${at}: '${id}' is tracked but not in the starting lineup (reserves have no tracking before a substitution)`);
      }
      if (!isPoint(frame?.ball)) report(`${at}: ball position is missing`);
      else if (!inBounds(frame.ball)) report(`${at}: ball is out of bounds (${frame.ball.x}, ${frame.ball.y})`);

      const previous = frames[index - 1];
      const elapsed = frame?.time - previous?.time;
      if (!(elapsed > 0)) return;
      const tooFast = (from, to, limit) => isPoint(from) && isPoint(to) && Math.hypot(to.x - from.x, to.y - from.y) / elapsed > limit;
      for (const id of active.keys()) {
        const [from, to] = [previous.players?.[id], frame.players?.[id]];
        if (tooFast(from, to, MAX_PLAYER_SPEED)) {
          const metres = Math.hypot(to.x - from.x, to.y - from.y);
          report(`${where}: player '${id}' jumps ${metres.toFixed(1)} m between t=${previous.time}s and t=${frame.time}s (over ${MAX_PLAYER_SPEED} m/s)`);
        }
      }
      if (tooFast(previous.ball, frame.ball, MAX_BALL_SPEED)) {
        report(`${where}: the ball jumps between t=${previous.time}s and t=${frame.time}s (over ${MAX_BALL_SPEED} m/s)`);
      }
    });
  }
  if (!momentIds.size) report("moments must contain at least one scenario");

  if (problems.length) {
    const listed = problems.slice(0, 10).map((problem) => `\n- ${problem}`).join("");
    const more = problems.length > 10 ? `\n- …and ${problems.length - 10} more` : "";
    const error = new Error(`Invalid demo match (${problems.length} problem${problems.length === 1 ? "" : "s"}):${listed}${more}`);
    error.problems = problems;
    throw error;
  }
  return match;
}

function createPlayer(id, displayName, team, role, age, values) {
  return { id, displayName, team, role, age, traits: Object.fromEntries(TRAIT_KEYS.map((key, i) => [key, values[i]])) };
}

function buildMoment(scenario, { teamOf, roleOf, starters }) {
  const { id, durationSec, formation, runs, ball: phases } = scenario;
  const times = Array.from({ length: Math.round(durationSec / FRAME_STEP_SEC) + 1 }, (_, i) => i * FRAME_STEP_SEC);
  if (!phases[0].holder || phases.at(-1).until !== durationSec) {
    throw new Error(`Scenario ${id}: the ball timeline must start with a holder and end at ${durationSec}s.`);
  }

  const paths = new Map(Object.entries(runs).map(([playerId, waypoints]) => {
    const path = [[0, ...formation[playerId]], ...waypoints];
    if (path.at(-1)[0] !== durationSec) throw new Error(`Scenario ${id}: the run for ${playerId} must end at ${durationSec}s.`);
    return [playerId, path];
  }));
  const ballAtFeet = (playerId, t) => {
    const path = paths.get(playerId);
    if (!path) throw new Error(`Scenario ${id}: ${playerId} touches the ball, so it needs a scripted run.`);
    const { x, y } = interpolate(path, t);
    return clampPoint({ x: x + BALL_OFFSET * (teamOf.get(playerId) === "HOME" ? 1 : -1), y });
  };

  const ballStates = times.map((t) => ballStateAt(phases, t, ballAtFeet));
  const ballTrack = ballStates.map(({ position }) => position);
  const possession = ballStates.map(({ controller }) => teamOf.get(controller));
  const tracks = new Map(starters.map((playerId) => [playerId, paths.has(playerId)
    ? times.map((t) => interpolate(paths.get(playerId), t))
    : offBallTrack(formation[playerId], roleOf.get(playerId), teamOf.get(playerId), ballTrack, possession)]));

  return {
    id,
    title: scenario.title,
    description: scenario.description,
    startClock: scenario.startClock,
    durationSec,
    context: scenario.context,
    targetPlayerId: scenario.targetPlayerId,
    candidatePlayerIds: [...scenario.candidatePlayerIds],
    frames: times.map((time, index) => ({
      time,
      players: Object.fromEntries(starters.map((playerId) => [playerId, roundPoint(tracks.get(playerId)[index])])),
      ball: roundPoint(ballTrack[index]),
    })),
  };
}

// Where the ball is at time t and which player controls it (the passer while it travels).
function ballStateAt(phases, t, ballAtFeet) {
  let phaseStart = 0;
  let lastHolder;
  for (const [index, phase] of phases.entries()) {
    const receiver = phase.pass ?? phase.shot;
    if (t < phase.until || index === phases.length - 1) {
      if (phase.holder) return { controller: phase.holder, position: ballAtFeet(phase.holder, t) };
      const share = (t - phaseStart) / (phase.until - phaseStart);
      const from = ballAtFeet(lastHolder, phaseStart);
      const to = ballAtFeet(receiver, phase.until);
      return { controller: lastHolder, position: { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share } };
    }
    lastHolder = phase.holder ?? receiver;
    phaseStart = phase.until;
  }
  throw new Error("The ball timeline is empty.");
}

// An off-ball player keeps a formation slot that slides with the ball and shifts with possession,
// approaching it with a reaction lag and a speed cap.
function offBallTrack([anchorX, anchorY], role, team, ballTrack, possession) {
  const follow = BLOCK_FOLLOW[role];
  const direction = team === "HOME" ? 1 : -1;
  const depth = POSSESSION_DEPTH * (role === "GK" ? 0.5 : 1);
  const ownGoalGap = role === "GK" ? 1 : GOAL_AREA_DEPTH;
  const hadBall = possession[0] === team ? 1 : 0;
  const maxStep = OFF_BALL_MAX_SPEED * FRAME_STEP_SEC;
  const [ballStart] = ballTrack;
  let position = { x: anchorX, y: anchorY };
  return ballTrack.map((ball, index) => {
    if (index === 0) return position;
    const hasBall = possession[index] === team ? 1 : 0;
    const target = clampPoint({
      x: anchorX + follow.x * (ball.x - ballStart.x) + direction * depth * (hasBall - hadBall),
      y: anchorY + follow.y * (hasBall ? IN_POSSESSION_WIDTH : 1) * (ball.y - ballStart.y),
    }, 1);
    target.x = direction === 1 ? Math.max(ownGoalGap, target.x) : Math.min(PITCH.length - ownGoalGap, target.x);
    const step = { x: (target.x - position.x) * OFF_BALL_RESPONSE, y: (target.y - position.y) * OFF_BALL_RESPONSE };
    const scale = Math.min(1, maxStep / (Math.hypot(step.x, step.y) || 1));
    position = { x: position.x + step.x * scale, y: position.y + step.y * scale };
    return position;
  });
}

function interpolate(path, t) {
  for (let index = 1; index < path.length; index += 1) {
    const [t1, x1, y1] = path[index];
    if (t <= t1) {
      const [t0, x0, y0] = path[index - 1];
      const share = (t - t0) / (t1 - t0);
      return { x: x0 + (x1 - x0) * share, y: y0 + (y1 - y0) * share };
    }
  }
  const [, x, y] = path.at(-1);
  return { x, y };
}

function clampPoint({ x, y }, margin = 0) {
  return {
    x: Math.min(PITCH.length - margin, Math.max(margin, x)),
    y: Math.min(PITCH.width - margin, Math.max(margin, y)),
  };
}

function roundPoint({ x, y }) {
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
