import { requireValue } from "../domain/validation.js";

const seconds = (clock) => {
  const parts = String(clock).split(":").map(Number);
  requireValue(parts.length >= 2 && parts.length <= 3 && parts.every(Number.isFinite), "Invalid SkillCorner source clock.");
  return parts.reduce((n, part) => n * 60 + part, 0);
};
const numeric = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const playerId = (id) => `skillcorner:${id}`;
const teamId = (id) => `skillcorner-team:${id}`;

/** Original coordinates/identity flags only. No interpolation or identity matching. */
export function normalizeSkillCorner(bundle) {
  requireValue(bundle?.schemaVersion === "skillcorner-clips-1" && /^[a-f0-9]{40}$/.test(bundle.revision), "Invalid SkillCorner prepared schema/revision.");
  const m = bundle.metadata;
  requireValue(Number.isInteger(m?.id) && Array.isArray(m.players) && Array.isArray(bundle.windows) && bundle.windows.length > 0,
    "SkillCorner metadata, roster and genuine source windows are required.");
  const source = { name: "SkillCorner Open Data", url: "https://github.com/SkillCorner/opendata", revision: bundle.revision,
    license: "MIT", files: bundle.files, coordinateMethod: "Metres centred on pitch; x shifted by half length, y inverted and shifted by half width; scaled to 0–100.",
    distribution: "public named broadcast tracking; selected source windows" };
  requireValue(Object.values(bundle.files ?? {}).length === 3 && Object.values(bundle.files).every((f) => /^[a-f0-9]{64}$/.test(f.sha256)), "Missing source-file hashes.");
  const players = m.players.map((p) => ({ id: playerId(p.id), providerId: String(p.id),
    name: `${p.first_name.trim()} ${p.last_name.trim()}`, shortName: p.short_name, jerseyNumber: p.number > 0 ? p.number : null,
    position: p.player_role?.name ?? null, secondaryPositions: [], teamId: teamId(p.team_id), source: "skillcorner",
    isStarter: p.start_time === "00:00:00", dateOfBirth: p.birthday ?? null }));
  const ids = new Set(players.map((p) => p.id));
  requireValue(ids.size === players.length, "Duplicate SkillCorner roster identity.");
  const coords = (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const point = { x: (p.x / m.pitch_length + .5) * 100, y: (.5 - p.y / m.pitch_width) * 100 };
    return point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100 ? point : null;
  };
  const framesById = new Map();
  for (const window of bundle.windows) for (const raw of window.frames) {
    requireValue([1, 2].includes(raw.period) && Number.isInteger(raw.frame), "Invalid SkillCorner source frame/period.");
    const positions = Object.fromEntries(players.map((p) => [p.id, null]));
    const provenance = Object.fromEntries(players.map((p) => [p.id, null]));
    const seen = new Set();
    for (const p of raw.player_data) {
      const id = playerId(p.player_id);
      requireValue(ids.has(id) && !seen.has(id), "Tracking player is unknown or duplicated in this frame.");
      seen.add(id);
      positions[id] = coords(p);
      provenance[id] = positions[id] === null ? null : p.is_detected === true ? "OBSERVED" : "ESTIMATED";
    }
    const detected = Object.values(provenance).filter((p) => p === "OBSERVED").length;
    const estimated = Object.values(provenance).filter((p) => p === "ESTIMATED").length;
    const matchTimeSec = seconds(raw.timestamp);
    const frame = { sourceFrame: raw.frame, period: raw.period, periodTimeSec: matchTimeSec - (raw.period === 2 ? 2700 : 0),
      matchTimeSec, videoTimeSec: raw.frame / 10, players: positions, ball: coords(raw.ball_data),
      playerProvenance: provenance, ballProvenance: raw.ball_data?.is_detected === true ? "OBSERVED" : "ESTIMATED",
      dataStatus: estimated || raw.ball_data?.is_detected !== true ? "ESTIMATED" : "OBSERVED",
      quality: { detectedPlayers: detected, extrapolatedPlayers: estimated, ballDetected: raw.ball_data?.is_detected === true } };
    if (framesById.has(raw.frame)) requireValue(JSON.stringify(framesById.get(raw.frame)) === JSON.stringify(frame), "Conflicting duplicate source frame.");
    framesById.set(raw.frame, frame);
  }
  const frames = [...framesById.values()].sort((a, b) => a.period - b.period || a.sourceFrame - b.sourceFrame);
  const selected = new Map(bundle.windows.map((w) => [w.event.event_id, w]));
  const events = bundle.possessions.map((e) => {
    const window = selected.get(e.event_id), first = window ? framesById.get(window.frames[0].frame) : null;
    const start = seconds(e.time_start);
    const actor = players.find((p) => p.providerId === e.player_id);
    requireValue(actor && [m.home_team.id, m.away_team.id].includes(Number(e.team_id)), "Possession event identity/participant mismatch.");
    const periodTimeSec = first?.periodTimeSec ?? start - (Number(e.period) === 2 ? 2700 : 0);
    const elapsedSeconds = periodTimeSec + m.match_periods.filter((p) => p.period < Number(e.period)).reduce((sum, p) => sum + p.duration_frames / 10, 0);
    return { id: e.event_id, type: e.end_type === "shot" ? "Shot" : e.end_type === "pass" ? "Pass" : "Possession",
      providerEventType: "player_possession", endType: e.end_type, playerId: actor.id, playerName: actor.name, teamId: teamId(e.team_id),
      period: Number(e.period), periodTimeSec, elapsedSeconds,
      matchTimeSec: first?.matchTimeSec ?? start, sourceFrame: Number(e.frame_start), aligned: !!first,
      epvTotal: numeric(e.possession_epv_total), leadToShot: e.lead_to_shot === "True", leadToGoal: e.lead_to_goal === "True" };
  });
  requireValue(events.filter((e) => e.aligned).length === bundle.windows.length, "Selected events are not source-frame aligned.");
  const homeRight = {};
  for (const period of [1, 2]) {
    const rows = bundle.possessions.filter((e) => Number(e.period) === period && Number(e.team_id) === m.home_team.id);
    const sides = [...new Set(rows.map((e) => e.attacking_side))];
    if (sides.length === 1 && ["left_to_right", "right_to_left"].includes(sides[0])) homeRight[period] = sides[0] === "left_to_right";
  }
  return { id: `skillcorner:${m.id}`, provider: "skillcorner", providerId: String(m.id),
    name: `${m.home_team.name} vs ${m.away_team.name}`, date: m.date_time.slice(0, 10),
    competition: "A-League Men", season: "2024/2025", venue: typeof m.stadium === "object" ? m.stadium.name : m.stadium,
    teams: [m.home_team, m.away_team].map((t) => ({ id: teamId(t.id), providerId: String(t.id), name: t.name, short: t.acronym })),
    score: { home: m.home_team_score, away: m.away_team_score }, pitch: { length: m.pitch_length, width: m.pitch_width }, fps: 10,
    players, frames, events, source, homeAttacksRightByPeriod: homeRight,
    eventAlignment: { verified: true, method: "SkillCorner same-match dynamic-event frame_start IDs matched exactly to tracking source frames." },
    limitations: [`Only ${bundle.windows.length} eight-second source windows are imported; unavailable intervals are not interpolated.`,
      "Broadcast tracking contains both detected and provider-extrapolated positions; is_detected is preserved for every player and ball frame.",
      "Final score is source metadata, not the score at the selected replay time.",
      "Possession EPV is a SkillCorner model output, not observed xG, a score prediction or evidence of a player's physical ability."] };
}
