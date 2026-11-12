import { readFile, readdir } from "node:fs/promises";
import { analyzeScenario, buildMomentum, createPossessionValue, methodology } from "../src/analytics/decisionSupport.js";
import { DomainError, requireValue, validateMatch } from "../src/domain/validation.js";
import { replacementProfiles, simulateAlternative } from "../src/simulation/alternative.js";
import { createExternalService } from "./external.js";
import { createBehaviorService } from "./behavior.js";
import { createVerifiedReplayService } from "./verified-replay.js";
import { createScenarioStore } from "./scenario-store.js";
import { fileURLToPath } from "node:url";
import { normalizeSkillCorner } from "../src/data/skillcorner.js";

const copy = (value) => structuredClone(value);
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export function createFootballService({ recording, grid, external = null, behavior = null, scenarioStore, pff = [], pffErrors = [], skillcorner = [], trackingErrors = [] }) {
  const match = freeze(validateMatch({ ...copy(recording), players: [...copy(recording.players), ...copy(replacementProfiles)] }));
  const possessionValue = createPossessionValue(grid, match.pitch);
  const momentum = buildMomentum(match, possessionValue);
  const provenance = freeze({
    tracking: { kind: "OBSERVED", ...match.source },
    events: { kind: "OBSERVED", source: match.source?.url },
    candidates: { kind: "ASSUMED", description: "Hypothetical replacement profiles; ages and traits are not scouting observations." },
    alternative: { kind: "SIMULATED", description: "Only the replacement moves differently. Recorded ball and all other players remain unchanged." },
    analytics: { kind: "DERIVED", methodologyVersion: methodology.version },
    epv: { kind: "MODEL", source: "https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking",
      revision: "7ed3ff857940d3f4611be55f3c08c79525c32171", license: "MIT", localNotice: "src/data/fot/LICENSE" },
    limitations: ["Not a prediction of the match result.", "Metrica players are anonymized; candidate identities are not joined to them.",
      "Three eight-second tracking windows; no full-match tracking replay.", "Ball height and successful control are unknown."],
  });

  function requireMatch(matchId) {
    if (matchId !== match.id) throw new DomainError("Match not found.", "MATCH_NOT_FOUND", 404);
  }
  function momentById(momentId) {
    const moment = match.moments.find(({ id }) => id === momentId);
    if (!moment) throw new DomainError("Scenario not found.", "SCENARIO_NOT_FOUND", 404);
    return moment;
  }
  function candidateById(candidateId) {
    const candidate = replacementProfiles.find(({ id }) => id === candidateId);
    if (!candidate) throw new DomainError("Candidate not found.", "CANDIDATE_NOT_FOUND", 404);
    return candidate;
  }
  function calculate(momentId, candidateId) {
    const moment = momentById(momentId);
    candidateById(candidateId);
    requireValue(moment.candidatePlayerIds.includes(candidateId), "Candidate is not eligible for this scenario.");
    const simulation = simulateAlternative({ match, momentId, candidateId });
    const analysis = analyzeScenario({ match, momentId, simulation, possessionValue });
    return { schemaVersion: "1.0", matchId: match.id, momentId, candidateId, simulation, analysis, provenance };
  }
  const summary = () => ({ id: match.id, name: match.name, dataKind: match.dataKind, pitch: match.pitch,
    scenarioCount: match.moments.length, candidateCount: replacementProfiles.length, source: match.source });
  const replayService = createVerifiedReplayService({ recording, external, behavior, possessionValue, pff, pffErrors, skillcorner, trackingErrors, ...(scenarioStore ? { store: scenarioStore } : {}) });
  return {
    ...createExternalService(external),
    ...createBehaviorService({ match, model: behavior }),
    ...replayService,
    listMatches: () => copy([summary()]),
    getMatch(matchId) {
      requireMatch(matchId);
      return copy({ ...summary(), fps: match.fps, matchEndSeconds: match.matchEndSeconds,
        homeAttacksRightFirstHalf: match.homeAttacksRightFirstHalf, lineup: match.lineup, players: match.players.map((player) => ({ ...player,
        dataKind: replacementProfiles.some(({ id }) => id === player.id) ? "ASSUMED" : "OBSERVED" })),
      moments: match.moments.map(({ frames, ...moment }) => ({ ...moment, frameCount: frames.length })), provenance });
    },
    getScenario(matchId, momentId) { requireMatch(matchId); return copy(momentById(momentId)); },
    getCandidates(matchId, momentId) {
      requireMatch(matchId);
      const eligible = momentId === undefined ? replacementProfiles.map(({ id }) => id) : momentById(momentId).candidatePlayerIds;
      return copy(replacementProfiles.filter(({ id }) => eligible.includes(id)).map((profile) => ({ ...profile, dataKind: "ASSUMED" })));
    },
    getMomentum(matchId) {
      if (matchId !== match.id) return replayService.getReplayMomentum(matchId);
      requireMatch(matchId);
      return copy({ matchId, points: momentum, methodology: methodology.momentum, provenance: provenance.events,
        eventsUsed: match.events.length, coverage: "recorded event locations; tracking exists only for the three clips" });
    },
    compare({ matchId, momentId, candidateId }) { requireMatch(matchId); return copy(calculate(momentId, candidateId)); },
    getScouting(matchId, candidateId) {
      requireMatch(matchId);
      const candidate = candidateById(candidateId);
      const scenarios = match.moments.filter(({ candidatePlayerIds }) => candidatePlayerIds.includes(candidateId))
        .map((moment) => ({ momentId: moment.id, context: moment.context, title: moment.title,
          ...calculate(moment.id, candidateId).analysis.scouting }));
      const contexts = [...new Set(scenarios.map(({ context }) => context))];
      const groups = contexts.map((context) => {
        const selected = scenarios.filter((scenario) => scenario.context === context);
        const mean = (branch) => selected.reduce((sum, item) => sum + item[branch].score, 0) / selected.length;
        return { context, scenarioCount: selected.length, weights: selected.map(({ momentId }) => ({ momentId, weight: 1 / selected.length })),
          baselineScore: mean("baseline"), alternativeScore: mean("alternative"), scoreDelta: mean("alternative") - mean("baseline") };
      });
      return copy({ matchId, candidate: { ...candidate, dataKind: "ASSUMED" }, scenarios, groups,
        overallScore: null, confidence: "low", explanation: methodology.aggregation, provenance });
    },
    getMethodology: () => copy(methodology),
  };
}

export async function loadFootballService({ scenarioFile = process.env.GHOSTXI_SCENARIO_STORE
  ?? fileURLToPath(new URL("../work/state/scenarios.json", import.meta.url)) } = {}) {
  let recording;
  try {
    recording = JSON.parse(await readFile(new URL("../src/data/metrica-game1.json", import.meta.url), "utf8"));
  } catch (error) {
    throw new Error("Cannot load the prepared Metrica dataset. Run npm ci and npm run prepare:data in GhostXI first.", { cause: error });
  }
  const grid = await readFile(new URL("../src/data/fot/EPV_grid.csv", import.meta.url), "utf8");
  let external = null;
  try { external = JSON.parse(await readFile(new URL("../src/data/external-football.json", import.meta.url), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (external) {
    // Cached downloads may outlive source configuration changes. Retired matches
    // must not reappear through the event API or candidate evidence.
    const sources = JSON.parse(await readFile(new URL("../config/external-sources.json", import.meta.url), "utf8"));
    const enabled = new Set(sources.statsbomb.matches.map((m) => m.id));
    external.statsbomb.matches = external.statsbomb.matches.filter((m) => enabled.has(m.metadata.match_id));
  }
  let behavior = null;
  try { behavior = JSON.parse(await readFile(new URL("../src/data/ai/profiles.json", import.meta.url), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const pff = [], pffErrors = [];
  const directory = new URL("../src/data/pff/", import.meta.url);
  let files = [];
  try { files = await readdir(directory); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const file of files.filter((file) => /^\d+\.json$/.test(file))) {
    try {
      const value = JSON.parse(await readFile(new URL(file, directory), "utf8"));
      if (value.schemaVersion !== "pff-1" || value.id !== `pff:${file.slice(0, -5)}`) throw new Error("PFF prepared identity/schema mismatch.");
      pff.push(value);
    } catch (error) { pffErrors.push({ file, reason: error.message }); }
  }
  const skillcorner = [], trackingErrors = [];
  const skillcornerDirectory = new URL("../src/data/skillcorner/replays/", import.meta.url);
  let trackingFiles = [];
  try { trackingFiles = await readdir(skillcornerDirectory); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const file of trackingFiles.filter((file) => /^\d+\.json$/.test(file))) {
    try {
      const value = normalizeSkillCorner(JSON.parse(await readFile(new URL(file, skillcornerDirectory), "utf8")));
      if (value.id !== `skillcorner:${file.slice(0, -5)}`) throw new Error("SkillCorner filename/source identity mismatch.");
      skillcorner.push(value);
    } catch (error) { trackingErrors.push({ file, reason: error.message }); }
  }
  return createFootballService({ recording, grid, external, behavior, pff, pffErrors, skillcorner, trackingErrors, scenarioStore: createScenarioStore({ filePath: scenarioFile }) });
}
