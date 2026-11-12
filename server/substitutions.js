import { DomainError, requireValue } from "../src/domain/validation.js";
import { footballRecommendation as config, classifyPosition, positionFit } from "../src/recommendation/config.js";
import { rankPlayerMoments } from "../src/recommendation/ranking.js";
import { replacementProfiles, simulateProfileAlternative } from "../src/simulation/alternative.js";
import { analyzeScenario, buildMomentum } from "../src/analytics/decisionSupport.js";
import { createMatchContexts, reconstructWindow, requireContext } from "./match-context.js";
import { createScenarioStore } from "./scenario-store.js";

const clone = (value) => structuredClone(value);
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round = (n) => Number(n.toFixed(6));
const CONTRACT_FIELDS = ["sportId", "matchId", "momentId", "originalPlayerId", "candidatePlayerId", "seed"];
const namedCategory = (score) => score >= 85 ? "Must-have candidate" : score >= 70 ? "Strong prospect" : score >= 50 ? "Possible fit" : "Low fit";

export function createSubstitutionService({ recording, external = null, behavior = null, possessionValue, store = createScenarioStore() }) {
  const withMomentum = { ...recording, momentum: buildMomentum(recording, possessionValue) };
  const contexts = createMatchContexts(withMomentum, external);
  const tm = new Map((external?.transfermarkt.players ?? []).map((p) => [p.providerId, p]));
  const links = new Map((external?.playerLinks ?? []).map((link) => [link.statsbombId, link.transfermarktId]));
  const externalPool = [...contexts.values()].filter(({ kind }) => kind === "events").flatMap((ctx) => ctx.players
    .filter((p) => links.has(p.providerId)).map((p) => {
      const transfermarktId = links.get(p.providerId);
      const market = tm.get(transfermarktId);
      return { ...p, position: market?.subPosition ?? p.position, gender: ctx.gender, transfermarktId };
    }));

  function historicalEvidence(ctx, candidate) {
    const history = (behavior?.historicalPlayerStats ?? []).filter((row) => row.date < (ctx.date ?? "0000-01-01"));
    const own = history.filter((row) => row.playerId === candidate.id && row.minutes > 0);
    const minutes = own.reduce((sum, row) => sum + row.minutes, 0);
    const sum = (rows, key) => rows.reduce((total, row) => total + (row.stats[key] ?? 0), 0);
    const attempted = sum(own, "passesAttempted");
    const contribution = minutes > 0 ? clamp((2 * sum(own, "progressivePasses") + 3 * sum(own, "keyPasses")
      + sum(own, "recoveries") + 0.25 * sum(own, "pressures") + 2 * sum(own, "shots")) * 90 / minutes / 40) : null;
    const team = history.filter((row) => row.teamId === candidate.targetTeamId);
    const eventMix = (rows) => {
      const values = [sum(rows, "passesAttempted"), sum(rows, "carries"), sum(rows, "shots")];
      const total = values.reduce((a, b) => a + b, 0);
      return total >= 10 ? values.map((n) => n / total) : null;
    };
    const ownMix = eventMix(own), teamMix = eventMix(team);
    return { historicalActionContribution: contribution,
      teamPlayingStyleFit: ownMix && teamMix ? 1 - ownMix.reduce((n, value, i) => n + Math.abs(value - teamMix[i]), 0) / 2 : null,
      passingCompletionRate: attempted ? sum(own, "passesCompleted") / attempted : null,
      progressivePassesPer90: minutes > 0 ? sum(own, "progressivePasses") * 90 / minutes : null,
      minutes, matchIds: [...new Set(own.map(({ matchId }) => matchId))],
      method: "Prior-match event contribution proxy per90 / 40; style is 1 minus half the L1 distance between pass/carry/shot shares. Unknown-minute rows are excluded. Neither is a validated ability rating." };
  }

  function selectedPlayer(ctx, id) {
    const player = ctx.players.find((player) => player.id === id);
    if (!player) throw new DomainError("Player ID is not part of this source match. Cross-provider names are not join keys.", "PLAYER_NOT_FOUND", 404);
    return player;
  }
  function candidates(ctx, originalId, timeSec = 0) {
    const original = selectedPlayer(ctx, originalId);
    const active = ctx.activeAt(timeSec);
    const bench = ctx.kind === "events" ? ctx.players.filter((p) => p.teamId === original.teamId && !active.has(p.id)) : [];
    const scouting = externalPool.filter((p) => (!ctx.gender || p.gender === ctx.gender) && !active.has(p.id) && p.id !== originalId);
    const modeled = replacementProfiles.map((p) => ({ id: p.id, name: p.displayName, position: p.role, secondaryPositions: [], modeled: p }));
    const pool = [...bench.map((p) => ({ ...p, source: "bench" })), ...scouting.map((p) => ({ ...p, source: "scouting" })),
      ...modeled.map((p) => ({ ...p, source: "scouting" }))];
    const seen = new Set();
    return pool.filter((p) => {
      if (seen.has(p.id) || p.id === originalId || active.has(p.id)) return false;
      seen.add(p.id); return true;
    }).map((p) => {
      const fit = positionFit(original.position, p.position, p.secondaryPositions);
      const history = historicalEvidence(ctx, { ...p, targetTeamId: original.teamId });
      const coverage = clamp((p.modeled ? 0.25 : p.transfermarktId ? 0.6 : 0.45)
        + (history.historicalActionContribution !== null ? 0.15 : 0), 0, 0.85);
      const publicCandidate = { id: p.id, name: p.name, position: p.position,
        secondaryPositions: p.secondaryPositions, source: p.source,
        attributes: { pace: null, reactionTime: null, awareness: null, passingAbility: null,
          passingCompletionRate: history.passingCompletionRate, progressivePassesPer90: history.progressivePassesPer90 },
        positionFit: fit, dataCoverage: coverage };
      return { publicCandidate, details: p, history, rank: 0.6 * (fit ?? 0.3) + 0.2 * coverage
        + 0.1 * (history.historicalActionContribution ?? 0) + (p.source === "bench" ? 0.1 : 0) };
    }).filter(({ publicCandidate }) => publicCandidate.positionFit === null
      ? classifyPosition(original.position) === null : publicCandidate.positionFit >= 0.55)
      .sort((a, b) => b.rank - a.rank || a.publicCandidate.id.localeCompare(b.publicCandidate.id));
  }
  function windowFor(ctx, playerId, momentId) {
    selectedPlayer(ctx, playerId);
    const found = ctx.windows(playerId).find(({ id }) => id === momentId);
    if (!found) throw new DomainError("Moment is unavailable for this player or lacks a stable active lineup.", "MOMENT_NOT_FOUND", 404);
    return found;
  }
  function validateInput(input) {
    requireValue(input && typeof input === "object" && !Array.isArray(input)
      && Object.keys(input).length === CONTRACT_FIELDS.length && CONTRACT_FIELDS.every((key) => Object.hasOwn(input, key)), "Use exactly sportId, matchId, momentId, originalPlayerId, candidatePlayerId and seed.");
    requireValue(input.sportId === "football", "Only football is configured for this MVP.");
    requireValue(CONTRACT_FIELDS.filter((key) => key !== "seed").every((key) => typeof input[key] === "string"
      && input[key].length > 0 && input[key].length <= 180), "Scenario IDs must be nonempty strings up to 180 characters.");
    requireValue(Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 0xffffffff, "seed must be an unsigned 32-bit integer.");
    const ctx = requireContext(contexts, input.matchId);
    requireValue(input.matchId === ctx.id, "Save the canonical source-prefixed match ID returned by the catalog.");
    const window = windowFor(ctx, input.originalPlayerId, input.momentId);
    const eligible = candidates(ctx, input.originalPlayerId, window.startSec).find(({ publicCandidate }) => publicCandidate.id === input.candidatePlayerId);
    if (!eligible) throw new DomainError("Candidate is active, incompatible, unknown, or not in the available bench/scouting pool.", "CANDIDATE_NOT_ELIGIBLE", 400);
    return { ctx, window, eligible };
  }

  function execute(scenario) {
    const { ctx, window, eligible } = validateInput(Object.fromEntries(CONTRACT_FIELDS.map((key) => [key, scenario[key]])));
    let engineMatch;
    if (ctx.kind === "events") engineMatch = reconstructWindow(ctx, window, scenario.originalPlayerId, scenario.candidatePlayerId);
    else {
      engineMatch = clone(ctx.recording);
      const ownIsHome = engineMatch.lineup.home.includes(scenario.originalPlayerId);
      if (!ownIsHome) {
        [engineMatch.lineup.home, engineMatch.lineup.away] = [engineMatch.lineup.away, engineMatch.lineup.home];
        engineMatch.homeAttacksRightFirstHalf = !engineMatch.homeAttacksRightFirstHalf;
      }
      engineMatch.players = engineMatch.players.map((p) => ({ ...p, team: engineMatch.lineup.home.includes(p.id) ? "HOME" : "AWAY" }));
      const originalMoment = engineMatch.moments.find(({ id }) => id === window.id);
      const dt = originalMoment.frames[1].time - originalMoment.frames[0].time;
      const a = originalMoment.frames[0].players[scenario.originalPlayerId], b = originalMoment.frames[1].players[scenario.originalPlayerId];
      const action = { ...originalMoment.action, team: ownIsHome ? originalMoment.action.team : originalMoment.action.team === "HOME" ? "AWAY" : "HOME" };
      engineMatch.moments = [{ ...originalMoment, targetPlayerId: scenario.originalPlayerId, candidatePlayerIds: [scenario.candidatePlayerId],
        initialVelocity: { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }, action }];
    }
    const defaults = config.modeledPhysical;
    const supplied = eligible.details.modeled;
    const movementProfile = { id: scenario.candidatePlayerId, displayName: eligible.publicCandidate.name, team: "HOME",
      role: eligible.publicCandidate.position, traits: supplied?.traits ?? Object.fromEntries(["pace", "positioning", "defending", "passing", "stamina"].map((key) => [key, defaults[key]])),
      acceleration: supplied?.acceleration ?? defaults.acceleration, reaction: supplied?.reaction ?? defaults.reaction, stepOut: supplied?.stepOut ?? defaults.stepOut };
    engineMatch.players.push(movementProfile);
    const simulation = simulateProfileAlternative({ match: engineMatch, momentId: window.id, profile: movementProfile, seed: scenario.seed });
    const analysis = analyzeScenario({ match: engineMatch, momentId: window.id, simulation, possessionValue });
    const normalize = (frames) => frames.map((frame) => ({ timeSec: frame.time,
      ball: { x: round(clamp(frame.ball.x / 105) * 100), y: round(clamp(frame.ball.y / 68) * 100) },
      players: Object.fromEntries(Object.entries(frame.players).map(([id, p]) => [id, { x: round(clamp(p.x / 105) * 100), y: round(clamp(p.y / 68) * 100) }])) }));
    const limitations = [
      ctx.kind === "events" ? "All continuous movement is estimated from one event plus generic role/formation templates; there is no observed 22-player tracking in this window."
        : "Original positions are observed Metrica tracking; anonymous identities are not joined to named StatsBomb players.",
      "Physical traits are unavailable for real candidates; explicitly modeled shared defaults are used. They are not measured player attributes.",
      "The ball and other players retain their reference paths. This mode measures geometric reach/position/value proxies, not changed possession, passing decisions or match outcomes.",
      "The scalar value is an uncalibrated assigned-role suitability proxy (0–100), not xG, goal probability or transfer success probability.",
      "This movement kernel has no stochastic component; the seed is retained for reproducible scenario identity and future engine compatibility.",
    ];
    const originalValue = analysis.scouting.baseline.score;
    const alternativeValue = analysis.scouting.alternative.score;
    const findings = analysis.metrics.map((metric) => ({ scenarioId: scenario.id, metricId: metric.id, unit: metric.unit,
      originalValue: metric.baseline, alternativeValue: metric.alternative, delta: metric.delta,
      interpretation: `${metric.label}: ${metric.baseline.toFixed(2)} → ${metric.alternative.toFixed(2)} ${metric.unit}; ${metric.better} is preferred under this method.`,
      limitation: limitations[0], suggestedInvestigation: `Review ${metric.label.toLowerCase()} in comparable recorded situations before making a coaching or recruitment decision.` }));
    return { result: { scenarioId: scenario.id, status: "completed", originalFrames: normalize(simulation.baselineFrames), alternativeFrames: normalize(simulation.alternativeFrames),
      metrics: { originalValue, alternativeValue, delta: alternativeValue - originalValue },
      explanations: findings.map(({ interpretation }) => interpretation), limitations,
      dataCoverage: Math.min(window.dataCoverage, eligible.publicCandidate.dataCoverage) },
    findings, context: ctx, candidate: eligible.publicCandidate, history: eligible.history,
    originalPosition: selectedPlayer(ctx, scenario.originalPlayerId).position, sourceStatus: window.dataStatus };
  }

  return {
    getSubstitutionLineup(matchId) {
      const ctx = requireContext(contexts, matchId);
      const active = ctx.activeAt(0);
      return { matchId: ctx.id, sportId: "football", players: ctx.players.map((p) => ({ ...p,
        isStarter: active.has(p.id), isBench: !active.has(p.id), position: active.get(p.id)?.position ?? p.position })), source: ctx.source };
    },
    getRecommendedMoments(matchId, { playerId, limit = 5, position, weights } = {}) {
      const ctx = requireContext(contexts, matchId);
      const player = selectedPlayer(ctx, playerId);
      requireValue(position === undefined || classifyPosition(position) !== null, "Unknown configured position.");
      return rankPlayerMoments({ matchId: ctx.id, playerId, position: position ?? player.position, windows: ctx.windows(playerId), limit,
        ...(weights ? { weights } : {}) });
    },
    getReplacementCandidates({ matchId, replacePlayerId }) {
      const ctx = requireContext(contexts, matchId);
      return candidates(ctx, replacePlayerId).slice(0, 40).map(({ publicCandidate }) => publicCandidate);
    },
    listSavedScenarios: () => store.list(),
    getSavedScenario: (id) => store.get(id),
    createSavedScenario(input) { validateInput(input); return store.create(input); },
    async updateSavedScenario(id, patch) {
      requireValue(patch && typeof patch === "object" && !Array.isArray(patch)
        && Object.keys(patch).length > 0 && Object.keys(patch).every((key) => CONTRACT_FIELDS.includes(key)), "Use only mutable scenario contract fields.");
      return store.update(id, ({ id: _id, ...old }) => { const input = { ...old, ...patch }; validateInput(input); return input; });
    },
    deleteSavedScenario: (id) => store.delete(id),
    async duplicateSavedScenario(id) { const { id: _id, ...input } = await store.get(id); validateInput(input); return store.create(input); },
    async simulateSavedScenario(id) { return execute(await store.get(id)).result; },
    async getSavedScenarioFindings(id) {
      const run = execute(await store.get(id));
      return { scenarioId: id, findings: run.findings, dataStatus: run.sourceStatus, source: run.context.source,
        historicalEvidence: run.history,
        modeledDefaults: config.modeledPhysical, limitations: run.result.limitations };
    },
    async getCandidateAssessment({ candidateId, matchId }) {
      const allSaved = (await store.list()).filter((row) => row.candidatePlayerId === candidateId && (!matchId || row.matchId === matchId));
      const saved = [...new Map(allSaved.map((row) => [JSON.stringify([row.matchId, row.momentId, row.originalPlayerId, row.candidatePlayerId]), row])).values()];
      if (!saved.length) throw new DomainError("Save at least one scenario for this candidate before aggregating results.", "NO_CANDIDATE_SCENARIOS", 404);
      const rows = saved.map((scenario) => ({ scenario, ...execute(scenario) }));
      const groups = [...new Set(rows.map(({ originalPosition }) => classifyPosition(originalPosition) ?? "unknown"))].map((role) => {
        const group = rows.filter(({ originalPosition }) => (classifyPosition(originalPosition) ?? "unknown") === role);
        const suitability = group.reduce((n, r) => n + (r.candidate.positionFit ?? 0), 0) / group.length;
        const simulated = group.reduce((n, r) => n + r.result.metrics.alternativeValue / 100, 0) / group.length;
        const coverage = group.reduce((n, r) => n + r.result.dataCoverage, 0) / group.length;
        const historicalValues = group.map((r) => r.history.historicalActionContribution).filter((value) => value !== null);
        const styleValues = group.map((r) => r.history.teamPlayingStyleFit).filter((value) => value !== null);
        const historical = historicalValues.length ? historicalValues.reduce((a, b) => a + b) / historicalValues.length : null;
        const style = styleValues.length ? styleValues.reduce((a, b) => a + b) / styleValues.length : null;
        const parts = [{ value: suitability, weight: 0.25 }, { value: historical, weight: 0.20 },
          { value: style, weight: 0.15 }, { value: simulated, weight: 0.30 }, { value: coverage, weight: 0.10 }].filter(({ value }) => value !== null);
        const rawScore = Math.round(100 * parts.reduce((n, p) => n + p.value * p.weight, 0) / parts.reduce((n, p) => n + p.weight, 0));
        const score = coverage < 0.6 ? Math.min(69, rawScore) : rawScore;
        return { role, scenarioCount: group.length, scenarioIds: group.map(({ scenario }) => scenario.id),
          teamFitScore: score, category: namedCategory(score), recruitmentPriority: coverage < 0.6 ? "Gather more evidence" : score >= 70 ? "Review candidate" : "Lower review priority",
          components: { positionalSuitability: suitability, historicalActionContribution: historical, teamPlayingStyleFit: style, simulatedContribution: simulated, dataCoverage: coverage },
          confidence: coverage < 0.6 ? "low" : "limited", strengths: [`Position compatibility ${(100 * suitability).toFixed(0)}%; modeled role score ${(100 * simulated).toFixed(0)}/100.`],
          weaknesses: [historical === null || style === null ? "Some prior-match contribution/style components are unavailable and excluded from scoring." : "Historical contribution/style are descriptive single-tournament proxies, not validated ability measures.",
            ...(coverage < 0.6 ? ["Low-coverage results are capped at 69; this is an evidence cap, not a measured quality rating."] : [])],
          methodology: "Provisional weights: position 25%, prior action contribution 20%, team action-mix similarity 15%, simulated role proxy 30%, coverage 10%. Unknown components are excluded and weights renormalized. Duplicate identical scenarios are counted once.",
        };
      });
      return { candidateId, groups, overallScore: groups.length === 1 ? groups[0].teamFitScore : null,
        limitation: "Heuristic decision support; not a probability of recruitment or transfer success. Different roles are not pooled." };
    },
  };
}
