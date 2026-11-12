import assert from "node:assert/strict";
import { after, test } from "node:test";
import { once } from "node:events";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiServer } from "../server/app.js";
import { loadFootballService } from "../server/service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const matchId = "metrica-game-1";
const momentId = "home-wide-interception";
const savedInput = {
  sportId: "football", matchId, momentId, seed: 42,
  originalPlayerId: "Player2", candidatePlayerId: "statsbomb:30714",
};

let shared, dispose;
after(async () => { if (dispose) await dispose(); });
async function fixture(t) {
  if (shared) {
    t.after(async () => {
      for (const scenario of await shared.service.listSavedScenarios()) await shared.service.deleteSavedScenario(scenario.id);
    });
    return shared;
  }
  const directory = await mkdtemp(join(root, "work", "coaching-api-"));
  const scenarioFile = join(directory, "scenarios.json");
  const service = await loadFootballService({ scenarioFile });
  const server = createApiServer({ service });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  dispose = async () => {
    await new Promise((resolve) => server.close(resolve));
    try { await unlink(scenarioFile); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rmdir(directory);
  };
  const get = async (query) => {
    const response = await fetch(`${origin}/api/coach?${query}`);
    return { response, body: await response.json() };
  };
  shared = { service, get, scenarioFile };
  t.after(async () => {
    for (const scenario of await service.listSavedScenarios()) await service.deleteSavedScenario(scenario.id);
  });
  return shared;
}

function assertReport(report) {
  assert.equal(report.matchId, matchId);
  assert.ok(["replace", "keep", "inconclusive"].includes(report.verdict));
  assert.ok(typeof report.headline === "string" && report.headline.length > 0);
  assert.ok(typeof report.summary === "string" && report.summary.length > 0);
  assert.ok(Array.isArray(report.reasons) && report.reasons.length > 0);
  assert.ok(Array.isArray(report.actions) && report.actions.length > 0);
  assert.ok(Array.isArray(report.alternatives) && report.alternatives.length > 0);
  assert.ok(report.windowSeconds > 7.8 && report.windowSeconds <= 8.1);
  assert.equal(report.scenario.matchId, matchId);
  assert.equal(report.context.match.id, matchId);
  assert.ok(report.context.endPeriodTimeSec > report.context.startPeriodTimeSec);
  assert.ok(report.simulation.evidence.recordedFacts.source);
  assert.ok(Array.isArray(report.simulation.limitations) && report.simulation.limitations.length > 0);
  assert.ok(report.simulation.branches.every((branch) => !Object.hasOwn(branch, "frames")));
}

test("coach HTTP automatically compares an eligible source window without saving scenarios", async (t) => {
  const { service, get } = await fixture(t);
  assert.deepEqual(await service.listSavedScenarios(), []);
  const { response, body } = await get(new URLSearchParams({ matchId }));
  assert.equal(response.status, 200);
  assertReport(body.data);
  assert.equal(body.data.context.analysisOrigin, "automatic");
  assert.ok(body.data.context.comparedCount >= 2);
  const scenario = body.data.scenario;
  const replacements = scenario.replacements ?? [{
    originalPlayerId: scenario.originalPlayerId, candidatePlayerId: scenario.candidatePlayerId,
  }];
  const page = service.getReplayTracking(matchId, { momentId: scenario.momentId, limit: 2000 });
  for (const replacement of replacements) {
    assert.ok(page.frames.every((frame) => frame.players[replacement.originalPlayerId]));
    const eligible = service.getReplacementCandidates({
      matchId, momentId: scenario.momentId, replacePlayerId: replacement.originalPlayerId,
    });
    assert.ok(eligible.some((candidate) => candidate.id === replacement.candidatePlayerId));
  }
  assert.deepEqual(await service.listSavedScenarios(), []);
});

test("coach HTTP retains the exact selected saved scenario and reproducible source context", async (t) => {
  const { service, get, scenarioFile } = await fixture(t);
  const selected = await service.createSavedScenario(savedInput);
  // A newer saved scenario must not replace an explicitly requested analysis.
  const other = await service.createSavedScenario({ ...savedInput, momentId: "home-defensive-press", seed: 99 });
  const originalResult = await service.simulateSavedScenario(selected.id);
  const before = await readFile(scenarioFile, "utf8");
  const { response, body } = await get(new URLSearchParams({ matchId, scenarioId: selected.id }));
  assert.equal(response.status, 200);
  const report = body.data;
  assertReport(report);
  assert.equal(report.context.analysisOrigin, "saved");
  assert.equal(report.scenarioId, selected.id);
  assert.deepEqual(report.scenario, selected);
  assert.equal(report.momentId, selected.momentId);
  assert.equal(report.originalPlayerId, selected.originalPlayerId);
  assert.deepEqual(report.simulation.metrics, originalResult.metrics);
  assert.deepEqual(report.simulation.evidence, originalResult.evidence);
  assert.deepEqual(report.simulation.branches.map((branch) => branch.metrics), originalResult.branches.map((branch) => branch.metrics));
  assert.equal(await readFile(scenarioFile, "utf8"), before);
  assert.deepEqual((await service.listSavedScenarios()).map((scenario) => scenario.id), [selected.id, other.id]);
});

test("coach HTTP preserves a multi-player scenario and its combined evaluation", async (t) => {
  const { service, get } = await fixture(t);
  const selected = await service.createSavedScenario({
    sportId: "football", matchId, momentId, seed: 42,
    replacements: [
      { originalPlayerId: "Player2", candidatePlayerId: "statsbomb:30714" },
      { originalPlayerId: "Player3", candidatePlayerId: "statsbomb:3009" },
    ],
  });
  const result = await service.simulateSavedScenario(selected.id);
  const { response, body } = await get(new URLSearchParams({ matchId, scenarioId: selected.id }));
  assert.equal(response.status, 200);
  assertReport(body.data);
  assert.deepEqual(body.data.scenario.replacements, selected.replacements);
  assert.equal(body.data.scenarioId, selected.id);
  assert.deepEqual(body.data.simulation.branches.map((branch) => branch.replacements), result.branches.map((branch) => branch.replacements));
  const combined = body.data.simulation.branches.find((branch) => branch.id === "combined");
  assert.ok(combined);
  assert.equal(combined.replacements.length, 2);
  assert.deepEqual(combined.metrics, result.branches.find((branch) => branch.id === "combined").metrics);
});

test("coach HTTP rejects cross-match saved analyses and invalid query parameters", async (t) => {
  const { service, get } = await fixture(t);
  const selected = await service.createSavedScenario(savedInput);
  const otherMatch = service.listReplayMatches().find((match) => match.id !== matchId);
  if (otherMatch) {
    const crossMatch = await get(new URLSearchParams({ matchId: otherMatch.id, scenarioId: selected.id }));
    assert.ok(crossMatch.response.status >= 400 && crossMatch.response.status < 500);
    assert.equal(crossMatch.body.data, undefined);
  } else {
    // The Metrica-only installation must still refuse an unrelated requested match.
    const crossMatch = await get(new URLSearchParams({ matchId: "different-match", scenarioId: selected.id }));
    assert.equal(crossMatch.response.status, 404);
  }
  for (const query of [
    "", `matchId=${matchId}&unknown=true`, `matchId=${matchId}&matchId=${matchId}`,
    `matchId=${matchId}&scenarioId=${selected.id}&scenarioId=${selected.id}`, `matchId=${matchId}&scenarioId=`,
  ]) {
    const { response, body } = await get(query);
    assert.equal(response.status, 400, query);
    assert.equal(body.data, undefined);
  }
  assert.equal((await get(new URLSearchParams({ matchId, scenarioId: "missing-scenario" }))).response.status, 404);
  assert.deepEqual(await service.listSavedScenarios(), [selected]);
});

test("coach HTTP is deterministic and does not invent a winner between identical modeled candidates", async (t) => {
  const { service, get } = await fixture(t);
  const query = new URLSearchParams({ matchId });
  const first = await get(query), second = await get(query);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  const report = first.body.data;
  assertReport(report);
  assert.ok(report.alternatives.length >= 2);
  const [reference, ...others] = report.alternatives;
  for (const alternative of others) {
    assert.deepEqual(alternative.metrics, reference.metrics);
    assert.equal(alternative.alternativeValue, reference.alternativeValue);
    assert.equal(alternative.delta, reference.delta);
  }
  assert.equal(report.comparisonsTied, true);
  assert.equal(report.preferredCandidateId, null);
  assert.deepEqual(second.body.data, report);
  assert.deepEqual(await service.listSavedScenarios(), []);
});
