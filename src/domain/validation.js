export class DomainError extends Error {
  constructor(message, code = "INVALID_INPUT", status = 400) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function requireValue(condition, message) {
  if (!condition) throw new DomainError(message);
}

export function point(value, pitch, label) {
  requireValue(value && Number.isFinite(value.x) && Number.isFinite(value.y), `${label} needs finite x/y coordinates.`);
  requireValue(value.x >= 0 && value.x <= pitch.length && value.y >= 0 && value.y <= pitch.width,
    `${label} is outside the pitch.`);
}

export function validateMoment(match, momentId) {
  requireValue(match && Array.isArray(match.moments) && Array.isArray(match.players), "A match with moments and players is required.");
  requireValue(match.pitch?.length > 0 && Number.isFinite(match.pitch.length)
    && match.pitch?.width > 0 && Number.isFinite(match.pitch.width), "Pitch dimensions must be positive finite metres.");
  const ids = match.players.map(({ id }) => id);
  requireValue(ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length, "Player IDs must be distinct nonempty strings.");
  const moment = match.moments.find(({ id }) => id === momentId);
  if (!moment) throw new DomainError("Scenario not found.", "SCENARIO_NOT_FOUND", 404);
  requireValue(["press", "transition", "attack"].includes(moment.context), "Unsupported scenario context.");
  const home = match.lineup?.home;
  const away = match.lineup?.away;
  requireValue(Array.isArray(home) && Array.isArray(away) && home.length === 11 && away.length === 11, "Each lineup must contain 11 players.");
  const starters = [...home, ...away];
  requireValue(new Set(starters).size === 22 && starters.every((id) => ids.includes(id)), "Lineups must identify 22 distinct known players.");
  requireValue(home.includes(moment.targetPlayerId), "The player under review must be in the Home lineup.");
  requireValue(Array.isArray(moment.candidatePlayerIds) && moment.candidatePlayerIds.length > 0
    && new Set(moment.candidatePlayerIds).size === moment.candidatePlayerIds.length
    && moment.candidatePlayerIds.every((id) => typeof id === "string" && !starters.includes(id)), "Scenario candidates must be distinct reserve IDs.");
  requireValue(Array.isArray(moment.frames) && moment.frames.length >= 2, "A scenario needs at least two tracking frames.");
  let previousTime = -Infinity;
  let previousSource = -Infinity;
  for (const frame of moment.frames) {
    requireValue(Number.isFinite(frame.time) && frame.time >= 0 && frame.time > previousTime, "Frame times must be finite and strictly increasing.");
    requireValue(Number.isInteger(frame.sourceFrame) && frame.sourceFrame > previousSource, "Source frame numbers must be increasing integers.");
    requireValue(frame.players && Object.keys(frame.players).length === 22
      && starters.every((id) => Object.hasOwn(frame.players, id)), "Every recorded frame needs all 22 starters.");
    for (const id of starters) point(frame.players[id], match.pitch, `Player ${id}`);
    point(frame.ball, match.pitch, "Ball");
    previousTime = frame.time;
    previousSource = frame.sourceFrame;
  }
  requireValue(moment.frames[0].time === 0 && moment.durationSec === moment.frames.at(-1).time, "Scenario duration must match its zero-based tracking times.");
  const action = moment.action;
  requireValue(action && ["HOME", "AWAY"].includes(action.team)
    && Number.isInteger(action.startFrame) && Number.isInteger(action.endFrame) && action.startFrame < action.endFrame
    && moment.frames.some((frame) => frame.sourceFrame === action.startFrame)
    && moment.frames.some((frame) => frame.sourceFrame === action.endFrame), "The action window must have recorded start/end frames and a known team.");
  requireValue(moment.period === undefined || [1, 2].includes(moment.period), "Only first/second-half scenarios are supported.");
  point(moment.anchor, match.pitch, "Tactical anchor");
  requireValue(moment.ballLead === undefined || Number.isFinite(moment.ballLead), "Ball lead must be finite.");
  requireValue(moment.initialVelocity && Number.isFinite(moment.initialVelocity.x) && Number.isFinite(moment.initialVelocity.y), "Initial velocity must be finite.");
  return moment;
}

export function validateMatch(match) {
  requireValue(match && typeof match.id === "string" && match.id.length > 0, "Match ID is required.");
  requireValue(typeof match.homeAttacksRightFirstHalf === "boolean", "The first-half attacking direction is required.");
  requireValue(Array.isArray(match.moments) && match.moments.length > 0
    && match.moments.every(({ id }) => typeof id === "string" && id.length > 0)
    && new Set(match.moments.map(({ id }) => id)).size === match.moments.length, "Match scenarios must have distinct nonempty IDs.");
  for (const moment of match.moments) {
    validateMoment(match, moment.id);
    requireValue(moment.candidatePlayerIds.every((id) => match.players.some((player) => player.id === id)), "All eligible candidates need a player profile.");
  }
  return match;
}
