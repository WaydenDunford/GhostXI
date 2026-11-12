import { requireValue } from "../domain/validation.js";

const point = (p) => p === null || (p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
const normalizeName = (name) => String(name).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export function isBosniaExample(match) {
  return /bosnia|bosn[aie]|herzegov|demirovic|tabakovic|jovo lukic|matej deket/.test(normalizeName(
    [match.name, ...(match.teams ?? []).map((t) => t.name), ...(match.players ?? []).map((p) => p.name)].join(" ")));
}

/** Derives coverage from actual frames. Never fills positions or creates frames. */
export function validateReplay(match) {
  requireValue(match && ["metrica", "pff", "skillcorner"].includes(match.provider)
    && typeof match.providerId === "string" && match.providerId.length > 0, "Unsupported or missing tracking provider identity.");
  requireValue(match.source?.url && Array.isArray(match.players) && Array.isArray(match.frames)
    && match.frames.length >= 2 && match.fps > 0 && match.fps <= 120, "Tracking source, roster and frames are required.");
  const roster = new Map(match.players.map((p) => [p.id, p]));
  const teamIds = match.teams.map((team) => team.id);
  requireValue(teamIds.length === 2 && new Set(teamIds).size === 2 && roster.size === match.players.length
    && match.players.every((p) => p.id && p.providerId && teamIds.includes(p.teamId)), "Roster IDs/teams must be distinct and source verified.");
  const segments = [], gaps = [], seenFrames = new Set(), periodPrevious = new Map();
  let segment;
  let missingBall = 0, missingPlayerValues = 0;
  for (const [index, frame] of match.frames.entries()) {
    requireValue([1, 2, 3, 4].includes(frame.period) && Number.isFinite(frame.periodTimeSec) && frame.periodTimeSec >= 0
      && Number.isInteger(frame.sourceFrame) && !seenFrames.has(frame.sourceFrame), "Invalid source frame identity/timestamp.");
    seenFrames.add(frame.sourceFrame);
    requireValue(["OBSERVED", "ESTIMATED"].includes(frame.dataStatus) && point(frame.ball)
      && frame.players && Object.keys(frame.players).length === roster.size
      && Object.entries(frame.players).every(([id, p]) => roster.has(id) && point(p)), "Coordinates must be finite 0–100 or explicitly null; all source roster IDs must be represented.");
    const previous = periodPrevious.get(frame.period);
    requireValue(!previous || frame.periodTimeSec > previous.periodTimeSec && frame.sourceFrame > previous.sourceFrame,
      "Source time and frame IDs must increase within each period.");
    const continuous = previous && frame.sourceFrame === previous.sourceFrame + 1
      && frame.periodTimeSec - previous.periodTimeSec <= 1.5 / match.fps;
    if (previous && !continuous) gaps.push({ period: frame.period, fromSec: previous.periodTimeSec, toSec: frame.periodTimeSec });
    const present = Object.keys(frame.players).filter((id) => frame.players[id] !== null);
    const complete = frame.ball !== null && present.length === 22 && teamIds.every((tid) => present.filter((id) => roster.get(id).teamId === tid).length === 11);
    missingBall += Number(frame.ball === null);
    missingPlayerValues += match.players.length - present.length;
    const sameLineup = segment && segment.playerIds.length === present.length && segment.playerIds.every((id) => present.includes(id));
    if (!complete || !continuous || !sameLineup || segment?.period !== frame.period) {
      segment = complete ? { period: frame.period, firstIndex: index, lastIndex: index,
        startSec: frame.periodTimeSec, endSec: frame.periodTimeSec, playerIds: present } : null;
      if (segment) segments.push(segment);
    } else { segment.lastIndex = index; segment.endSec = frame.periodTimeSec; }
    periodPrevious.set(frame.period, frame);
  }
  const usableSegments = segments.filter((s) => s.endSec - s.startSec >= 8 - 1 / match.fps / 2);
  // The old named prototype needs additional independent identity/characteristic
  // evidence. No adapter in this checkout currently provides that evidence.
  const bosniaBlocked = isBosniaExample(match) && !(match.eligibilityEvidence?.historicalParticipantsVerified === true
    && match.eligibilityEvidence?.candidateCharacteristicsVerified === true
    && match.eligibilityEvidence?.stableIdentityMappingsVerified === true
    && match.eligibilityEvidence?.actionsSeparated === true && match.frames.every((f) => f.dataStatus === "OBSERVED")
    && Array.isArray(match.eligibilityEvidence?.sourceFiles) && match.eligibilityEvidence.sourceFiles.every((f) => /^[a-f0-9]{64}$/.test(f.sha256))
    && match.eligibilityEvidence.sourceFiles.length >= 3);
  return { segments: usableSegments, gaps, frameCount: match.frames.length, missingBall, missingPlayerValues,
    playable: usableSegments.length > 0 && !bosniaBlocked, bosniaBlocked,
    status: bosniaBlocked ? "excluded_unverified_bosnia" : usableSegments.length ? "validated_tracking_windows" : "insufficient_continuous_coverage" };
}

export function metricaReplay(recording) {
  const coords = (p) => ({ x: p.x / recording.pitch.length * 100, y: p.y / recording.pitch.width * 100 });
  return { id: recording.id, provider: "metrica", providerId: "1", name: recording.name, date: null,
    teams: [{ id: "HOME", providerId: "Home", name: "Home (anonymous)" }, { id: "AWAY", providerId: "Away", name: "Away (anonymous)" }],
    pitch: recording.pitch, fps: recording.fps, source: recording.source, score: null,
    players: recording.players.map((p) => ({ id: p.id, providerId: p.id, name: p.displayName, position: p.role ?? null,
      secondaryPositions: [], teamId: p.team, source: "metrica", isStarter: true, dateOfBirth: null })),
    frames: recording.moments.flatMap((m) => m.frames.map((f) => ({ sourceFrame: f.sourceFrame, period: m.period ?? 1,
      periodTimeSec: m.startTime + f.time, matchTimeSec: m.startTime + f.time, videoTimeSec: null, dataStatus: "OBSERVED",
      ball: coords(f.ball), players: Object.fromEntries(Object.entries(f.players).map(([id, p]) => [id, coords(p)])), quality: { issues: [] } }))),
    events: recording.events, eventAlignment: { verified: recording.moments.every((m) => m.frames.some((f) => f.sourceFrame === m.action.startFrame)
      && m.frames.some((f) => f.sourceFrame === m.action.endFrame)), method: "same-match Metrica event source frame IDs" },
    limitations: ["Only three eight-second tracking windows are imported; gaps between them are unavailable.",
      "Source players and teams are anonymous; no named historical identity, match date or score is claimed."] };
}
