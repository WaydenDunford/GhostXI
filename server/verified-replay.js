import { DomainError, requireValue } from "../src/domain/validation.js";
import { metricaReplay, validateReplay } from "../src/data/replay.js";
import { createMatchContexts } from "./match-context.js";
import { rankPlayerMoments } from "../src/recommendation/ranking.js";
import { classifyPosition, positionFit, footballRecommendation } from "../src/recommendation/config.js";
import { buildMomentum } from "../src/analytics/decisionSupport.js";
import { simulateGhostBranch, modeledMovement } from "../src/simulation/multi-ghost.js";
import { createScenarioStore } from "./scenario-store.js";

const clone = (value) => structuredClone(value);
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (value) => Number(value.toFixed(6));
const category = (n) => n >= 85 ? "Must-have candidate" : n >= 70 ? "Strong prospect" : n >= 50 ? "Possible fit" : "Low fit";

export function createVerifiedReplayService({ recording, external, behavior, possessionValue, pff = [], pffErrors = [], store = createScenarioStore() }) {
  recording = clone(recording);
  const all = [metricaReplay(recording), ...pff].map((value) => {
    try { return { ...clone(value), validation: validateReplay(value) }; }
    catch (error) { return { ...value, frames: [], validation: { playable: false, status: "failed", reason: error.message, frameCount: 0, segments: [] } }; }
  });
  const catalog = new Map(all.filter((m) => m.validation.playable).map((m) => [m.id, m]));
  const metricaMomentum = buildMomentum(recording, possessionValue);
  const metricaContext = createMatchContexts({ ...recording, momentum: metricaMomentum }, null).get(recording.id);
  const profiles = new Map();
  const links = new Map((external?.playerLinks ?? []).map((row) => [row.statsbombId, row.transfermarktId]));
  const market = new Map((external?.transfermarkt.players ?? []).map((p) => [p.providerId, p]));
  for (const raw of external?.statsbomb?.matches ?? []) for (const team of raw.lineups) for (const p of team.lineup) {
    if (!links.has(p.player_id)) continue;
    const id = `statsbomb:${p.player_id}`, tm = market.get(links.get(p.player_id));
    const positionCounts = new Map();
    for (const event of raw.events) if (event.player?.id === p.player_id && event.position?.name) {
      positionCounts.set(event.position.name, (positionCounts.get(event.position.name) ?? 0) + 1);
    }
    const modalPosition = [...positionCounts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const reportedPosition = p.positions?.[0]?.position ?? "unknown";
    const position = modalPosition?.[1] >= 5 ? modalPosition[0] : reportedPosition;
    if (!profiles.has(id)) profiles.set(id, { id, name: p.player_nickname || p.player_name,
      position, secondaryPositions: [...positionCounts].filter(([name,count]) => name !== position && count >= 5).map(([name]) => name),
      source: "scouting", teamId: `statsbomb:${team.team_id}`, team: team.team_name,
      dateOfBirth: tm?.dateOfBirth ?? null, positionDate: raw.metadata.match_date,
      provenance: { provider: "statsbomb", matchId: `statsbomb:${raw.metadata.match_id}`, playerId: p.player_id,
        revision: external.statsbomb.revision, url: "https://github.com/hudl/open-data", marketPlayerId: tm?.id ?? `transfermarkt:${links.get(p.player_id)}`,
        positionMethod: modalPosition?.[1] >= 5 ? "most frequent recorded event position in this source match; not a claimed natural role" : "reported source lineup position; not a claimed natural role",
        reportedLineupPosition: reportedPosition, eventPositionCounts: Object.fromEntries(positionCounts),
        positionConflict: classifyPosition(position) !== classifyPosition(reportedPosition),
        identityMapping: "explicit curated source-ID crosswalk; no Metrica identity join" } });
  }
  function requireMatch(id) {
    const match = catalog.get(id);
    if (!match) throw new DomainError("No validated available tracking replay for this match. Event-only/reconstructed and unverified scenarios are excluded.", "REPLAY_NOT_AVAILABLE", 404);
    return match;
  }
  function player(match, id) {
    const found = match.players.find((p) => p.id === id);
    if (!found) throw new DomainError("Player is not a verified roster identity in this source match.", "PLAYER_NOT_FOUND", 404);
    return found;
  }
  function summary(match) {
    return { id: match.id, provider: match.provider, providerId: match.providerId, name: match.name, date: match.date,
      teams: match.teams, score: match.score, pitch: match.pitch, fps: match.fps,
      playable: true, trackingStatus: [...new Set(match.frames.map((f) => f.dataStatus))],
      coverage: match.validation, source: match.source, limitations: match.limitations };
  }
  function moments(match, selectedId, limit = 5, position) {
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 10, "limit must be an integer from 1 to 10.");
    if (selectedId) player(match, selectedId);
    if (!match.eventAlignment.verified) return [];
    if (match.provider === "metrica") {
      const id = selectedId ?? recording.moments[0].targetPlayerId;
      return rankPlayerMoments({ matchId: match.id, playerId: id, position: position ?? player(match, id).position,
        windows: metricaContext.windows(id), limit: Math.min(limit, 5) });
    }
    // PFF semantic event schemas must be explicitly mapped/aligned before ranking.
    // Imported markers/events remain available as evidence; unknown semantics do
    // not become a fabricated momentum series or invented tactical opportunity.
    return [];
  }
  function candidateDetails(match, originalId, activeIds = match.validation.segments[0].playerIds) {
    const original = player(match, originalId);
    const pool = [...match.players.filter((p) => p.teamId === original.teamId && p.isStarter === false)
      .map((p) => ({ ...p, source: "bench", provenance: { ...match.source, provider: match.provider, playerId: p.providerId, matchId: match.id } })), ...profiles.values()];
    const seen = new Set();
    return pool.filter((p) => {
      if (activeIds.includes(p.id) || seen.has(p.id)) return false;
      seen.add(p.id); return true;
    }).map((p) => {
      const fit = positionFit(original.position, p.position, p.secondaryPositions);
      const rows = (behavior?.historicalPlayerStats ?? []).filter((row) => row.playerId === p.id && row.minutes > 0
        && (!match.date || row.date < match.date));
      const passes = rows.reduce((n, row) => n + (row.stats.passesAttempted ?? 0), 0);
      const completed = rows.reduce((n, row) => n + (row.stats.passesCompleted ?? 0), 0);
      return { ...p, positionFit: fit, dataCoverage: rows.length ? .6 : .4,
        ageAtHistoricalMatch: match.date && p.dateOfBirth && p.dateOfBirth <= match.date
          ? Number(match.date.slice(0, 4)) - Number(p.dateOfBirth.slice(0, 4)) - Number(match.date.slice(5) < p.dateOfBirth.slice(5)) : null,
        attributes: { sprintSpeed: null, reactionTime: null, tacticalAwareness: null, spatialIntelligence: null, physicalAbility: null,
          passingCompletionRate: passes ? completed / passes : null },
        historicalActions: rows.map(({ matchId, date, minutes, stats }) => ({ matchId, date, minutes, stats })),
        missingAttributes: ["sprintSpeed", "reactionTime", "tacticalAwareness", "spatialIntelligence", "physicalAbility",
          ...(!match.date ? ["ageAtHistoricalMatch: original match date is unavailable"] : [])],
        limitations: ["Identity and descriptive statistics are verified independently; this is a modeled replacement, not an identity match to the historical outgoing player.",
          ...(!match.date && rows.length ? ["Original match date is unknown; profile actions are descriptive reference data, not verified pre-match evidence."] : [])] };
    }).filter((p) => p.positionFit === null || p.positionFit >= .55)
      .sort((a, b) => (b.positionFit ?? .3) - (a.positionFit ?? .3) || b.dataCoverage - a.dataCoverage || a.id.localeCompare(b.id));
  }
  function publicCandidates(matchId, originalId) { return clone(candidateDetails(requireMatch(matchId), originalId)); }
  function windowFor(match, momentId) {
    if (match.provider === "metrica") {
      const window = recording.moments.find((m) => m.id === momentId);
      if (!window) throw new DomainError("Observed scenario window not found.", "MOMENT_NOT_FOUND", 404);
      return { frames: clone(window.frames), period: window.period ?? 1, timeSec: window.startTime,
        cueTimeSec: window.frames.find((f) => f.sourceFrame === window.action.startFrame).time,
        anchors: { [window.targetPlayerId]: window.anchor }, sourceStatus: "OBSERVED" };
    }
    const event = match.events.find((event) => `event:${event.id}` === momentId && event.aligned);
    if (!event) throw new DomainError("No source-aligned event scenario is available.", "MOMENT_NOT_FOUND", 404);
    const segment = match.validation.segments.find((s) => s.period === event.period && s.startSec <= event.periodTimeSec && s.endSec >= event.periodTimeSec + 8);
    requireValue(segment, "Source event lacks eight seconds of continuous, complete, stable-lineup tracking.");
    const chosen = match.frames.slice(segment.firstIndex, segment.lastIndex + 1).filter((f) => f.periodTimeSec >= event.periodTimeSec && f.periodTimeSec <= event.periodTimeSec + 8);
    requireValue(chosen.at(-1).periodTimeSec - chosen[0].periodTimeSec >= 8 - 1 / match.fps, "Insufficient source-frame coverage.");
    const metres = (p) => ({ x: p.x / 100 * match.pitch.length, y: p.y / 100 * match.pitch.width });
    return { frames: chosen.map((f) => ({ time: f.periodTimeSec - chosen[0].periodTimeSec, sourceFrame: f.sourceFrame,
      ball: metres(f.ball), players: Object.fromEntries(Object.entries(f.players).filter(([, p]) => p !== null).map(([id, p]) => [id, metres(p)])) })),
      period: event.period, timeSec: chosen[0].periodTimeSec, cueTimeSec: 0, anchors: {}, sourceStatus: "ESTIMATED" };
  }
  function validateScenario(input) {
    requireValue(input && typeof input === "object" && !Array.isArray(input), "Scenario must be an object.");
    const multi = Object.hasOwn(input, "replacements");
    const fields = ["sportId", "matchId", "momentId", "seed", ...(multi ? ["replacements"] : ["originalPlayerId", "candidatePlayerId"])];
    requireValue(Object.keys(input).length === fields.length && fields.every((k) => Object.hasOwn(input, k))
      && input.sportId === "football" && ["matchId", "momentId"].every((k) => typeof input[k] === "string" && input[k].length <= 180)
      && Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 0xffffffff, "Use the football scenario contract and an unsigned 32-bit seed.");
    const replacements = multi ? input.replacements : [{ originalPlayerId: input.originalPlayerId, candidatePlayerId: input.candidatePlayerId }];
    requireValue(Array.isArray(replacements) && replacements.length >= 1 && replacements.length <= 4
      && replacements.every((r) => r && Object.keys(r).length === 2 && ["originalPlayerId", "candidatePlayerId"].every((k) => typeof r[k] === "string" && r[k].length <= 180))
      && new Set(replacements.map((r) => r.originalPlayerId)).size === replacements.length
      && new Set(replacements.map((r) => r.candidatePlayerId)).size === replacements.length, "Provide 1–4 distinct originals and candidates; each replacement has exactly two IDs.");
    const match = requireMatch(input.matchId), window = windowFor(match, input.momentId);
    const active = Object.keys(window.frames[0].players);
    const selected = replacements.map((r) => {
      requireValue(active.includes(r.originalPlayerId), "Outgoing player is not active in the selected tracking window.");
      const found = candidateDetails(match, r.originalPlayerId, active).find((p) => p.id === r.candidatePlayerId);
      requireValue(found, "Candidate is active, fictional, unmapped, incompatible or lacks a verified profile.");
      return found;
    });
    requireValue(new Set(replacements.map((r) => player(match, r.originalPlayerId).teamId)).size === 1, "All replacements in this coaching comparison must belong to the same team.");
    return { match, window, replacements, selected };
  }
  function execute(scenario) {
    const { id, ...input } = scenario;
    const { match, window, replacements, selected } = validateScenario(input);
    const normal = (frames) => frames.map((f) => ({ timeSec: f.time, ball: { x: f.ball.x / match.pitch.length * 100, y: f.ball.y / match.pitch.width * 100 },
      players: Object.fromEntries(Object.entries(f.players).map(([id, p]) => [id, { x: p.x / match.pitch.length * 100, y: p.y / match.pitch.width * 100 }])) }));
    const baseline = normal(window.frames), results = [];
    const homeRight = match.provider === "metrica"
      ? window.period === 1 ? recording.homeAttacksRightFirstHalf : !recording.homeAttacksRightFirstHalf
      : match.homeAttacksRightByPeriod?.[String(window.period)];
    const ownIsHome = player(match, replacements[0].originalPlayerId).teamId === match.teams[0].id;
    const attacksRight = typeof homeRight === "boolean" ? ownIsHome ? homeRight : !homeRight : null;
    const branchSets = [...replacements.map((r) => [r]), ...(replacements.length > 1 ? [replacements] : [])];
    const evaluate = (frames, set, alternative) => {
      const distances = frames.flatMap((frame) => set.map((r) => dist(frame.players[alternative ? r.candidatePlayerId : r.originalPlayerId], frame.ball)));
      const access = mean(distances.map((d) => Number(d <= 1.6)));
      const geometricValue = attacksRight === null ? null : mean(frames.map((f) => possessionValue({x:f.ball.x / match.pitch.length * recording.pitch.length, y:f.ball.y / match.pitch.width * recording.pitch.width}, attacksRight)
        * Math.exp(-Math.min(...set.map((r) => dist(f.players[alternative ? r.candidatePlayerId : r.originalPlayerId], f.ball))) / 4)));
      const pairDistances = set.length < 2 ? [] : frames.flatMap((frame) => set.flatMap((r,i) => set.slice(i+1).map((other) =>
        dist(frame.players[alternative ? r.candidatePlayerId : r.originalPlayerId], frame.players[alternative ? other.candidatePlayerId : other.originalPlayerId]))));
      return { meanBallDistanceM: mean(distances), ballAccessFraction: access, valueAccessProxy: geometricValue,
        minGhostSeparationM: pairDistances.length ? Math.min(...pairDistances) : null,
        roleProxy: Math.round(100 * (access * .7 + Math.exp(-mean(distances) / 10) * .3)) };
    };
    for (const [index, set] of branchSets.entries()) {
      const run = simulateGhostBranch({ frames: window.frames, replacements: set, pitch: match.pitch,
        anchors: window.anchors, cueTimeSec: window.cueTimeSec, seed: input.seed });
      const original = evaluate(window.frames, set, false), alternative = evaluate(run.frames, set, true);
      results.push({ id: set.length > 1 ? "combined" : `individual:${index + 1}`, replacements: clone(set), dataStatus: "SIMULATED",
        frames: normal(run.frames), originalMetrics: original, alternativeMetrics: alternative,
        metrics: { originalValue: original.roleProxy, alternativeValue: alternative.roleProxy, delta: alternative.roleProxy - original.roleProxy }, coupling: run.coupling });
    }
    const last = results.at(-1), limitations = [...match.limitations,
      "Physical movement parameters are shared explicit model assumptions, separate from observed player profiles. They are not measured abilities.",
      "Ball and non-replaced players retain source paths; this does not predict possession, goals, interception probability or match outcomes.",
      "Role score, ball proximity and value access are uncalibrated geometric proxies. Seed is retained; this steering kernel has no randomness.",
      ...(attacksRight === null ? ["Attacking direction is unavailable; directional value access is null."] : [])];
    const findings = results.flatMap((b) => ["meanBallDistanceM", "ballAccessFraction", "valueAccessProxy", "minGhostSeparationM"]
      .filter((key) => b.originalMetrics[key] !== null && b.alternativeMetrics[key] !== null).map((key) => ({
      scenarioId: id, branchId: b.id, metricId: key, originalValue: b.originalMetrics[key], alternativeValue: b.alternativeMetrics[key],
      delta: round(b.alternativeMetrics[key] - b.originalMetrics[key]), unit: key.endsWith("M") ? "m" : "fraction/proxy",
      interpretation: `${key}: ${b.originalMetrics[key].toFixed(4)} → ${b.alternativeMetrics[key].toFixed(4)}; a modeled geometric difference.`,
      limitation: "Ball proximity is not possession or an interception probability.", suggestedInvestigation: "Review the same role and situation in additional genuine tracking windows." })));
    return { scenarioId: id, status: "completed", originalFrames: baseline, alternativeFrames: last.frames,
      metrics: last.metrics, explanations: findings.map((f) => `${f.branchId}: ${f.interpretation}`), limitations,
      dataCoverage: Math.min(...selected.map((p) => p.dataCoverage)), originalDataStatus: window.sourceStatus,
      originalLineup: Object.keys(window.frames[0].players), branches: results, findings,
      evidence: { recordedFacts: { matchId: match.id, source: match.source, period: window.period, startPeriodTimeSec: window.timeSec,
        sourceFrameStart: window.frames[0].sourceFrame, sourceFrameEnd: window.frames.at(-1).sourceFrame },
      modelEstimates: { parameters: modeledMovement, branches: results.map((b) => b.id) },
      hypotheses: ["Recruitment and tactical benefits need additional same-context observations; no historical outcome is implied."] } };
  }
  const mutable = (row) => { const { id, ...input } = row; return input; };
  return {
    getRecommendationConfig: () => clone({ ...footballRecommendation, modeledPhysical: modeledMovement }),
    listReplayMatches: () => [...catalog.values()].map(summary),
    getReplayMatch: (id) => ({ ...summary(requireMatch(id)), players: clone(requireMatch(id).players),
      historicalSubstitutions: [...requireMatch(id).events, ...(requireMatch(id).trackingMarkers ?? [])].filter((e) => e.type === "SUB" || e.type === "Substitution"),
      historicalSubstitutionsStatus: requireMatch(id).trackingMarkers?.some((e) => e.type === "SUB") ? "provider_markers; inspect raw identity fields" : "no synchronized substitution records imported",
      eventAlignment: clone(requireMatch(id).eventAlignment) }),
    getReplayTracking(id, { momentId, period, fromSec, toSec, offset = 0, limit = 500 } = {}) {
      const match = requireMatch(id);
      requireValue(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 2000, "Invalid tracking pagination.");
      let frames = match.frames;
      if (momentId) { const win = windowFor(match, momentId); const ids = new Set(win.frames.map((f) => f.sourceFrame)); frames = frames.filter((f) => ids.has(f.sourceFrame)); }
      if (period !== undefined) frames = frames.filter((f) => f.period === period);
      if (fromSec !== undefined) frames = frames.filter((f) => f.periodTimeSec >= fromSec);
      if (toSec !== undefined) frames = frames.filter((f) => f.periodTimeSec <= toSec);
      return { matchId: id, coordinateSystem: "0-100 top-left; source stadium axes", timeBasis: "periodTimeSec; sourceFrame and videoTimeSec are separate",
        total: frames.length, offset, limit, frames: clone(frames.slice(offset, offset + limit)), coverage: clone(match.validation), noInterpolation: true };
    },
    getDatasetStatus() {
      const providers = all.map((m) => ({ provider: m.provider, matchIdentifier: m.id,
        tracking: { available: m.frames.length > 0, frameCount: m.validation.frameCount, segments: m.validation.segments, missingBall: m.validation.missingBall ?? null },
        events: { available: (m.events ?? []).length > 0, synchronized: m.eventAlignment?.verified === true }, rosters: { available: (m.players ?? []).length > 0, players: (m.players ?? []).length },
        playerProfileCoverage: m.provider === "metrica" ? "anonymous source roster; no named identity joins" : "source roster; missing physical traits",
        accessibility: m.source?.distribution?.includes("test excerpt") ? "public_parser_excerpt_only" : "local_files_available",
        validationStatus: m.validation.status, playable: m.validation.playable, limitations: [...(m.limitations ?? []), ...(m.validation.reason ? [m.validation.reason] : [])], source: m.source }));
      if (!pff.length) providers.push({ provider: "pff", matchIdentifier: "pff:10517", playable: false,
        accessibility: "requested_access_files_missing", validationStatus: "not_imported", missingFiles: ["per-game metadata", "roster", "10517.jsonl.bz2", "events.json and explicit alignment"],
        source: { url: "https://www.blog.fc.pff.com/blog/pff-fc-release-2022-world-cup-data" } });
      for (const raw of external?.statsbomb?.matches ?? []) providers.push({ provider: "statsbomb", matchIdentifier: `statsbomb:${raw.metadata.match_id}`,
        tracking: { available: false }, events: { available: true, synchronized: false }, rosters: { available: true }, playerProfileCoverage: "source events and curated market links",
        accessibility: "local_files_available", validationStatus: "validated_event_only", playable: false, limitations: ["Event-only data cannot supply a real tracking replay."] });
      for (const provider of ["skillcorner", "wyscout"]) providers.push({ provider, matchIdentifier: null, tracking: { available: false }, events: { available: false },
        rosters: { available: false }, playerProfileCoverage: "none imported", accessibility: "files_not_imported", validationStatus: "adapter_available_in_pitchkit_only", playable: false });
      return { verifiedDataOnly: true, providers, importErrors: pffErrors, policy: "No reconstructed source positions, name-only identity joins or unsupported Bosnia scenarios in the replay catalog." };
    },
    getSubstitutionLineup(id) { const m = requireMatch(id); return { matchId: id, sportId: "football", players: clone(m.players).map((p) => ({ ...p,
      position: p.position ?? "unknown", isBench: p.isStarter === false, dataStatus: "OBSERVED" })), source: m.source }; },
    getRecommendedMoments: (id, { playerId, limit = 5, position } = {}) => moments(requireMatch(id), playerId, limit, position),
    getReplacementCandidates: ({ matchId, replacePlayerId }) => publicCandidates(matchId, replacePlayerId),
    listSavedScenarios: async () => (await store.list()).filter((row) => { try { validateScenario(mutable(row)); return true; } catch { return false; } }),
    async getSavedScenario(id) { const row = await store.get(id); validateScenario(mutable(row)); return row; },
    createSavedScenario(input) { validateScenario(input); return store.create(input); },
    async updateSavedScenario(id, patch) {
      requireValue(patch && typeof patch === "object" && !Array.isArray(patch) && Object.keys(patch).length > 0
        && !Object.hasOwn(patch, "id"), "Use mutable scenario fields.");
      return store.update(id, (row) => { const next = { ...mutable(row), ...patch }; validateScenario(next); return next; });
    },
    deleteSavedScenario: (id) => store.delete(id),
    async duplicateSavedScenario(id) { const input = mutable(await store.get(id)); validateScenario(input); return store.create(input); },
    async simulateSavedScenario(id) { return execute(await store.get(id)); },
    async getSavedScenarioFindings(id) { const r = execute(await store.get(id)); return { scenarioId: id, findings: r.findings,
      dataStatus: r.originalDataStatus, source: r.evidence.recordedFacts.source, evidence: r.evidence, modeledDefaults: modeledMovement, limitations: r.limitations }; },
    async getCandidateAssessment({ candidateId, matchId }) {
      const valid = (await store.list()).filter((r) => !matchId || r.matchId === matchId).flatMap((r) => { try { return [{ scenario: r, result: execute(r) }]; } catch { return []; } });
      const unique = [...new Map(valid.map((r) => [JSON.stringify(mutable({ ...r.scenario, seed: 0 })), r])).values()];
      const rows = unique.flatMap(({ result, scenario }) => result.branches.filter((b) => b.replacements.length === 1 && b.replacements[0].candidatePlayerId === candidateId)
        .map((b) => ({ scenario, branch: b, result, candidate: candidateDetails(requireMatch(scenario.matchId), b.replacements[0].originalPlayerId).find((p) => p.id === candidateId) })));
      if (!rows.length) throw new DomainError("Save a valid tracking scenario for this candidate first.", "NO_CANDIDATE_SCENARIOS", 404);
      const groupKey = (row) => {
        const original = player(requireMatch(row.scenario.matchId), row.branch.replacements[0].originalPlayerId);
        return [row.scenario.matchId, original.teamId, classifyPosition(original.position) ?? "unknown"].join("|");
      };
      const groups = [...new Set(rows.map(groupKey))].map((key) => {
      const selectedRows = rows.filter((row) => groupKey(row) === key);
      const coverage = mean(selectedRows.map((r) => r.result.dataCoverage));
      const fitValues = selectedRows.map((r) => r.candidate?.positionFit).filter((n) => n !== null && n !== undefined);
      const position = fitValues.length ? mean(fitValues) : null, simulated = mean(selectedRows.map((r) => r.branch.metrics.alternativeValue)) / 100;
      const score = Math.min(69, Math.round(100 * ((position ?? 0) * .3 + simulated * .5 + coverage * .2) / (position === null ? .7 : 1)));
      return { role: key.split("|").at(-1), matchId: selectedRows[0].scenario.matchId, scenarioCount: selectedRows.length,
        scenarioIds: selectedRows.map((r) => r.scenario.id), teamFitScore: score, category: category(score), recruitmentPriority: "Gather more evidence", confidence: "low",
        components: { positionalSuitability: position, historicalActionContribution: null, teamPlayingStyleFit: null, simulatedContribution: simulated, dataCoverage: coverage },
        strengths: ["Verified candidate identity and source profile; simulated geometric contribution is reported separately."],
        weaknesses: ["Team tactical fit and calibrated position-specific ability are unverified; historical anonymous tracking cannot establish a named player's ability."],
        methodology: "Provisional geometric review proxy: role 30%, simulation 50%, coverage 20%; unknown role is excluded and weights renormalized. Evidence cap 69." };
      });
      return { candidateId, overallScore: groups.length === 1 ? groups[0].teamFitScore : null, groups,
        limitation: "No prediction of transfer success. Anonymous source tracking and named counterfactual identities remain separate." };
    },
  };
}
