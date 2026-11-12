import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyzeScenario, buildMomentum, createPossessionValue } from "../src/analytics/decisionSupport.js";
import { replacementProfiles, simulateAlternative } from "../src/simulation/alternative.js";

const [raw, grid] = await Promise.all([
  readFile(new URL("../src/data/metrica-game1.json", import.meta.url), "utf8"),
  readFile(new URL("../src/data/fot/EPV_grid.csv", import.meta.url), "utf8"),
]);
const match = JSON.parse(raw);
const moment = match.moments[0];
moment.candidatePlayerIds = replacementProfiles.map(({ id }) => id);
const possessionValue = createPossessionValue(grid, match.pitch);
const simulate = (candidateId) => simulateAlternative({ match, momentId: moment.id, candidateId });

test("the model replaces only one trajectory and starts at the observed position", () => {
  const candidateId = moment.candidatePlayerIds[0];
  const { baselineFrames, alternativeFrames, outgoingPlayerId } = simulate(candidateId);
  assert.equal(baselineFrames.length, 201);
  assert.deepEqual(alternativeFrames, simulate(candidateId).alternativeFrames);
  assert.deepEqual(alternativeFrames[0].players[candidateId], baselineFrames[0].players[outgoingPlayerId]);
  assert.notDeepEqual(alternativeFrames[100].players[candidateId], baselineFrames[100].players[outgoingPlayerId]);

  for (const [index, original] of baselineFrames.entries()) {
    const alternative = alternativeFrames[index];
    assert.equal(alternative.sourceFrame, original.sourceFrame);
    assert.equal(alternative.time, original.time);
    assert.deepEqual(alternative.ball, original.ball);
    assert.equal(Object.keys(alternative.players).length, 22);
    assert.ok(!Object.hasOwn(alternative.players, outgoingPlayerId));
    for (const [id, point] of Object.entries(original.players)) {
      if (id !== outgoingPlayerId) assert.deepEqual(alternative.players[id], point);
    }
  }
  assert.deepEqual(baselineFrames, JSON.parse(raw).moments[0].frames);
});

test("both profiles produce distinct, finite role-fit evidence and share the recorded baseline", () => {
  const analyses = moment.candidatePlayerIds.map((id) => analyzeScenario({
    match, momentId: moment.id, simulation: simulate(id), possessionValue,
  }));
  assert.deepEqual(analyses[0].metrics.map(({ baseline }) => baseline), analyses[1].metrics.map(({ baseline }) => baseline));
  assert.notDeepEqual(analyses[0].metrics.map(({ alternative }) => alternative), analyses[1].metrics.map(({ alternative }) => alternative));
  for (const { metrics, recommendation, qualityLabel } of analyses) {
    assert.ok(metrics.every(({ baseline, alternative, delta }) => [baseline, alternative, delta].every(Number.isFinite)));
    assert.ok(recommendation.score >= 0 && recommendation.score <= 100);
    assert.match(qualityLabel, /Low confidence/);
  }
});

test("the EPV grid mirrors by attack direction and the recorded momentum covers both teams", () => {
  assert.equal(possessionValue({ x: 102, y: 34 }, true), possessionValue({ x: 3, y: 34 }, false));
  assert.equal(possessionValue({ x: -0.1, y: 34 }, true), 0);
  const momentum = buildMomentum(match, possessionValue);
  assert.equal(momentum.length, 96);
  assert.ok(momentum.some(({ value }) => value > 0));
  assert.ok(momentum.some(({ value }) => value < 0));
  assert.ok(momentum.every(({ value }) => Math.abs(value) <= 1));
});
