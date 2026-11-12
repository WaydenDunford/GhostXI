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
const possessionValue = createPossessionValue(grid, match.pitch);
const simulate = (momentId, candidateId) => simulateAlternative({ match, momentId, candidateId });

test("all three moments contain complete tracking and compatible modeled candidates", () => {
  assert.deepEqual(match.moments.map(({ context }) => context).sort(), ["attack", "press", "transition"]);
  const starters = [...match.lineup.home, ...match.lineup.away].sort();
  assert.equal(new Set(starters).size, 22);
  assert.ok(replacementProfiles.filter(({ age }) => age < 21).length >= 2);
  for (const moment of match.moments) {
    assert.equal(moment.frames.length, 201);
    assert.equal(moment.durationSec, 8);
    assert.ok(match.lineup.home.includes(moment.targetPlayerId));
    for (const frame of moment.frames) assert.deepEqual(Object.keys(frame.players).sort(), starters);
    for (const id of moment.candidatePlayerIds) {
      assert.ok(replacementProfiles.some((profile) => profile.id === id));
      assert.ok(!starters.includes(id));
    }
  }
});

for (const moment of match.moments) {
  test(`${moment.context}: the model changes only one trajectory and yields distinct profile evidence`, () => {
    const analyses = moment.candidatePlayerIds.map((candidateId) => {
      const simulation = simulate(moment.id, candidateId);
      const { baselineFrames, alternativeFrames, outgoingPlayerId } = simulation;
      assert.deepEqual(alternativeFrames, simulate(moment.id, candidateId).alternativeFrames);
      assert.deepEqual(alternativeFrames[0].players[candidateId], baselineFrames[0].players[outgoingPlayerId]);
      assert.notDeepEqual(alternativeFrames[100].players[candidateId], baselineFrames[100].players[outgoingPlayerId]);

      for (const [index, original] of baselineFrames.entries()) {
        const { [outgoingPlayerId]: outgoing, ...otherPlayers } = original.players;
        const alternative = alternativeFrames[index];
        const { [candidateId]: replacement, ...unchangedPlayers } = alternative.players;
        assert.equal(alternative.sourceFrame, original.sourceFrame);
        assert.equal(alternative.time, original.time);
        assert.deepEqual(alternative.ball, original.ball);
        assert.deepEqual(unchangedPlayers, otherPlayers);
        assert.ok(replacement.x >= 0 && replacement.x <= 105 && replacement.y >= 0 && replacement.y <= 68);
      }
      const analysis = analyzeScenario({ match, momentId: moment.id, simulation, possessionValue });
      const { metrics, recommendation, qualityLabel } = analysis;
      assert.ok(metrics.every(({ baseline, alternative, delta }) => [baseline, alternative, delta].every(Number.isFinite)));
      assert.ok(recommendation.score >= 0 && recommendation.score <= 100);
      assert.match(qualityLabel, /Low confidence/);
      return analysis;
    });
    assert.deepEqual(analyses[0].metrics.map(({ baseline }) => baseline), analyses[1].metrics.map(({ baseline }) => baseline));
    assert.notDeepEqual(analyses[0].metrics.map(({ alternative }) => alternative), analyses[1].metrics.map(({ alternative }) => alternative));
    if (moment.id === "home-wide-interception") {
      assert.deepEqual(analyses.map(({ recommendation }) => recommendation.score), [73, 71]);
      assert.deepEqual(analyses[0].metrics.map(({ baseline, alternative }) => [baseline.toFixed(2), alternative.toFixed(2)]),
        [["3.47", "1.53"], ["2.82", "1.82"], ["0.00", "0.00"], ["0.70", "1.21"]]);
    }
    assert.deepEqual(moment.frames, JSON.parse(raw).moments.find(({ id }) => id === moment.id).frames);
  });
}

test("the EPV grid mirrors by attack direction and the recorded momentum covers both teams", () => {
  assert.equal(possessionValue({ x: 102, y: 34 }, true), possessionValue({ x: 3, y: 34 }, false));
  assert.equal(possessionValue({ x: -0.1, y: 34 }, true), 0);
  const momentum = buildMomentum(match, possessionValue);
  assert.equal(momentum.length, 96);
  assert.ok(momentum.some(({ value }) => value > 0));
  assert.ok(momentum.some(({ value }) => value < 0));
  assert.ok(momentum.every(({ value }) => Math.abs(value) <= 1));
});
