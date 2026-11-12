import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { simulateBehavior } from "../src/ai/simulation.js";
import { buildBehaviorProfiles } from "../src/ai/profiles.js";
import { createBehaviorService } from "../server/behavior.js";
import { createApiServer } from "../server/app.js";
import { loadFootballService } from "../server/service.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";

const read = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
const [match, model] = await Promise.all([read("metrica-game1.json"), read("ai/profiles.json")]);
const momentId = "home-deep-pass-attack";

test("profile artifact excludes the held-out final and exposes uncertain minutes rather than making them up", () => {
  assert.equal(model.historyMatchCount, 12);
  assert.equal(model.holdoutMatchId, 3943043);
  assert.equal(model.profiles.length, 2);
  for (const profile of model.profiles) {
    assert.equal(profile.sample.matchCount, 6);
    assert.ok(profile.sample.appearances.every(({ date, matchId }) => date < model.cutoffDate && matchId !== model.holdoutMatchId));
    assert.ok(profile.validation.events > 0);
    assert.ok(Number.isFinite(profile.validation.eventTypeLogLoss));
    assert.ok(Number.isFinite(profile.validation.cohortEventTypeLogLoss));
    for (const cell of Object.values(profile.habits.contexts)) {
      assert.ok(Object.values(cell.probabilities).every((p) => Number.isFinite(p) && p > 0 && p < 1));
      assert.ok(Math.abs(Object.values(cell.probabilities).reduce((a, b) => a + b) - 1) < 1e-10);
      if (cell.sampleSize === 0) assert.deepEqual(cell.probabilities, cell.cohortPrior);
    }
  }
  assert.equal(model.profiles[1].sample.minutes, null);
  assert.equal(model.profiles[1].sample.unknownMinutesMatchCount, 2);
  assert.deepEqual(model.profiles[0].physical, model.profiles[1].physical);
});

test("fitting rejects future observations and the holdout before reading their features", () => {
  for (const metadata of [{ match_date: "2024-07-14", match_id: 123 }, { match_date: "2024-07-01", match_id: 3943043 }]) {
    assert.throws(() => buildBehaviorProfiles({ history: { schemaVersion: "1.0", matches: [{ metadata }],
      cutoffDate: "2024-07-14", holdoutMatchId: 3943043 } }), /holdout|future/);
  }
});

test("reactive simulation is seeded, preserves its observed start and obeys movement limits for all 22 players", () => {
  const snapshot = structuredClone(match);
  const profile = model.profiles[0];
  const result = simulateBehavior({ match, momentId, profile, seed: 42 });
  assert.deepEqual(simulateBehavior({ match, momentId, profile, seed: 42 }), result);
  assert.equal(result.alternativeFrames.length, 201);
  assert.equal(result.recordedContextFrames.length, 201);
  assert.equal(result.referenceAvailableUntilSec, 0.4);
  assert.equal(result.referenceFrames.at(-1).time, 0.4);
  const first = result.referenceFrames[0];
  assert.deepEqual(result.alternativeFrames[0].ball, first.ball);
  assert.deepEqual(result.alternativeFrames[0].players[profile.id], first.players[result.outgoingPlayerId]);
  for (const [index, frame] of result.alternativeFrames.entries()) {
    assert.equal(Object.keys(frame.players).length, 22);
    assert.ok(!Object.hasOwn(frame.players, result.outgoingPlayerId));
    for (const [id, point] of Object.entries(frame.players)) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= 105 && point.y >= 0 && point.y <= 68);
      if (index > 0) {
        const prior = result.alternativeFrames[index - 1];
        const maxSpeed = id === profile.id ? profile.physical.maxSpeed : 6.5;
        assert.ok(Math.hypot(point.x - prior.players[id].x, point.y - prior.players[id].y) <= maxSpeed * (frame.time - prior.time) + 1e-7);
      }
    }
  }
  assert.ok(result.events.some(({ type }) => /interception|reception/.test(type)));
  assert.ok(Object.keys(first.players).filter((id) => id !== result.outgoingPlayerId)
    .some((id) => JSON.stringify(result.alternativeFrames[100].players[id]) !== JSON.stringify(first.players[id])));
  assert.deepEqual(match, snapshot);
});

test("decisions change with behavior evidence, not the candidate's name or market identity", () => {
  const original = model.profiles[0];
  const first = simulateBehavior({ match, momentId, profile: original, seed: 42 });
  const relabeled = { ...original, name: "Arbitrary display label", transfermarktId: "different", marketValue: 999999999 };
  const renamed = simulateBehavior({ match, momentId, profile: relabeled, seed: 42 });
  assert.deepEqual(first.alternativeFrames, renamed.alternativeFrames);
  assert.deepEqual(first.decisions, renamed.decisions);
  const swapped = { ...original, habits: structuredClone(model.profiles[1].habits) };
  const second = simulateBehavior({ match, momentId, profile: swapped, seed: 42 });
  assert.notEqual(first.decisions[0].action, second.decisions[0].action);
  assert.notDeepEqual(first.alternativeFrames, second.alternativeFrames);
  assert.notDeepEqual(first.alternativeFrames, simulateBehavior({ match, momentId, profile: original, seed: 99 }).alternativeFrames);
});

test("behavior API supports the complete Lovable flow and rejects invalid seeds, profiles and scenarios", async () => {
  const server = createApiServer({ service: await loadFootballService() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const api = createGhostXIClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` });
  try {
    assert.equal((await api.getBehaviorStatus()).ready, true);
    const fitted = await api.getBehaviorProfiles();
    assert.equal(fitted.profiles.length, 2);
    const [scenario] = await api.getBehaviorScenarios();
    for (const candidateId of scenario.candidateIds) {
      assert.equal((await api.getBehaviorProfile(candidateId)).id, candidateId);
      const result = await api.runBehaviorSimulation({ matchId: scenario.matchId, momentId: scenario.momentId, candidateId, seed: 42 });
      assert.equal(result.alternativeFrames.length, 201);
      assert.ok(result.decisions.length > 0);
      assert.ok(Object.values(result.analysis.metrics).every(Number.isFinite));
    }
    const input = { matchId: scenario.matchId, momentId: scenario.momentId, candidateId: scenario.candidateIds[0] };
    await assert.rejects(api.runBehaviorSimulation({ ...input, seed: -1 }), (error) => error.status === 400);
    await assert.rejects(api.runBehaviorSimulation({ ...input, candidateId: "missing" }), (error) => error.status === 404);
    await assert.rejects(api.runBehaviorSimulation({ ...input, momentId: "home-defensive-press" }), (error) => error.status === 400);
    await assert.rejects(api.runBehaviorSimulation({ ...input, gpuToken: "extra" }), (error) => error.status === 400);
  } finally { await new Promise((resolve) => server.close(resolve)); }
  const missing = createBehaviorService({ match });
  assert.equal(missing.getBehaviorStatus().ready, false);
  assert.throws(() => missing.getBehaviorProfiles(), (error) => error.status === 503);
});
