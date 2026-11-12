import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCoachingReport } from "../server/coaching-report.js";

const match = { id: "match", name: "City v United" };
const players = [{ id: "out", name: "Alex Current" }, { id: "out2", name: "Sam Current" }];
const candidates = [{ id: "a", name: "Taylor Option" }, { id: "b", name: "Jordan Option" }, { id: "c", name: "Casey Option" }];
const scenario = { id: "selected", matchId: "match", momentId: "phase", originalPlayerId: "out", candidatePlayerId: "a" };
const baseline = { meanBallDistanceM: 10, ballAccessFraction: 0.2, valueAccessProxy: 0.01, minGhostSeparationM: null };
const improved = { ...baseline, meanBallDistanceM: 7, ballAccessFraction: 0.35, valueAccessProxy: 0.014 };
function branch(alternative = improved, pairs, original = baseline, metrics = { originalValue: 22, alternativeValue: 23, delta: 1 }) {
  return { ...(pairs ? { replacements: pairs } : {}), originalMetrics: original, alternativeMetrics: alternative, metrics };
}
function evaluation(current = scenario, branches = [branch()]) {
  return { scenario: current, result: { scenarioId: current.id, status: "completed", branches } };
}
function report(evaluations = [evaluation()], extra = {}) {
  return buildCoachingReport({ match, scenario, evaluations, candidates, players, windowSeconds: 8, momentTitle: "Build-up", ...extra });
}

test("a measurable improvement supports a named trial limited to the simulated phase", () => {
  const output = report();
  assert.equal(output.verdict, "replace");
  assert.equal(output.preferredCandidateId, "a");
  assert.match(output.headline, /Taylor Option for Alex Current/);
  assert.match(output.summary, /8-second phase/);
  assert.match(output.reasons.join(" "), /10 to 7 m/);
  assert.equal(output.alternatives[0].metrics.find((metric) => metric.id === "ballAccessFraction").alternative, 35);
  assert.match(output.evidenceNote, /do not predict possession, goals or full-match suitability/);
});

test("harmful movement keeps the current player even if the rounded proxy score rises", () => {
  const output = report([evaluation(scenario, [branch({ ...baseline, meanBallDistanceM: 14, ballAccessFraction: 0.1, valueAccessProxy: 0.005 })])]);
  assert.equal(output.verdict, "keep");
  assert.equal(output.preferredCandidateId, null);
  assert.match(output.headline, /Keep Alex Current/);
  assert.match(output.reasons.join(" "), /rises by 4 m/);
});

test("equal candidate responses never arbitrarily select a named best player", () => {
  const second = { ...scenario, id: "other", candidatePlayerId: "b" };
  const output = report([evaluation(), evaluation(second)]);
  assert.equal(output.verdict, "replace");
  assert.equal(output.comparisonsTied, true);
  assert.equal(output.preferredCandidateId, null);
  assert.match(output.summary, /Taylor Option and Jordan Option|Jordan Option and Taylor Option/);
  assert.match(output.reasons.join(" "), /same measured movement response under shared movement assumptions/);
  assert.match(output.actions.join(" "), /another phase/);
});

test("a proximity gain with less time close to the ball is an unresolved tradeoff", () => {
  const output = report([evaluation(scenario, [branch({ ...baseline, meanBallDistanceM: 7, ballAccessFraction: 0.1 })])]);
  assert.equal(output.verdict, "inconclusive");
  assert.equal(output.preferredCandidateId, null);
  assert.match(output.reasons.join(" "), /tradeoff/);
  assert.match(output.reasons.join(" "), /20% to 10%/);
});

test("null and nonfinite measurements cannot create an evidence-based recommendation", () => {
  const output = report([evaluation(scenario, [branch({ meanBallDistanceM: Infinity, ballAccessFraction: NaN, valueAccessProxy: null }, undefined,
    { meanBallDistanceM: NaN, ballAccessFraction: null, valueAccessProxy: Infinity },
    { originalValue: Infinity, alternativeValue: NaN, delta: null })])]);
  assert.equal(output.verdict, "inconclusive");
  assert.equal(output.alternatives[0].originalValue, null);
  assert.deepEqual(output.alternatives[0].metrics, []);
  assert.doesNotMatch(JSON.stringify(output), /NaN|Infinity/);
  assert.match(output.reasons.join(" "), /not enough movement measurements/);
});

test("different match, moment, original player, failed run or explicit duration are excluded", () => {
  const unrelated = [
    { ...scenario, id: "other-match", matchId: "other" },
    { ...scenario, id: "other-phase", momentId: "other" },
    { ...scenario, id: "other-player", originalPlayerId: "out2" },
    { ...scenario, id: "other-duration", windowSeconds: 12 },
  ].map((current) => evaluation(current));
  const failed = evaluation(); failed.result.status = "failed";
  const staleId = evaluation(); staleId.result.scenarioId = "stale";
  const staleEvidence = evaluation(); staleEvidence.result.evidence = { recordedFacts: { matchId: "different" } };
  const output = report([...unrelated, failed, staleId, staleEvidence]);
  assert.equal(output.verdict, "inconclusive");
  assert.deepEqual(output.alternatives, []);
  assert.equal(output.preferredCandidateId, null);
  assert.match(output.actions[0], /Keep the current player until/);
});

test("small movement differences do not turn a rounded score jump into an improvement", () => {
  const output = report([evaluation(scenario, [branch({ ...baseline, meanBallDistanceM: 9.9, ballAccessFraction: 0.21, valueAccessProxy: 0.0101 }, undefined,
    baseline, { originalValue: 40, alternativeValue: 50, delta: 10 })])]);
  assert.equal(output.verdict, "keep");
  assert.match(output.reasons.join(" "), /differences are too small/);
});

test("a clearly dominant comparable alternative can be preferred over the selected option", () => {
  const second = { ...scenario, id: "other", candidatePlayerId: "b" };
  const output = report([evaluation(), evaluation(second, [branch({ ...improved, meanBallDistanceM: 5, ballAccessFraction: 0.5, valueAccessProxy: 0.02 })])]);
  assert.equal(output.verdict, "replace");
  assert.equal(output.preferredCandidateId, "b");
  assert.match(output.headline, /Jordan Option/);
});

test("candidate tradeoffs do not produce a fabricated best-player ranking", () => {
  const second = { ...scenario, id: "other", candidatePlayerId: "b" };
  const output = report([evaluation(scenario, [branch({ ...improved, meanBallDistanceM: 5 })]),
    evaluation(second, [branch({ ...improved, ballAccessFraction: 0.55 })])]);
  assert.equal(output.verdict, "replace");
  assert.equal(output.comparisonsTied, false);
  assert.equal(output.preferredCandidateId, null);
  assert.match(output.summary, /do not establish one clear best choice/);
});

test("same identifiers with different source baselines cannot be ranked together", () => {
  const second = { ...scenario, id: "other", candidatePlayerId: "b" };
  const output = report([evaluation(), evaluation(second, [branch(improved, undefined, { ...baseline, meanBallDistanceM: 15 })])]);
  assert.deepEqual(output.alternatives.map((option) => option.candidateId), ["a"]);
});

test("multiple changes expose combined spacing tradeoffs and name single-change trials", () => {
  const pairs = [{ originalPlayerId: "out", candidatePlayerId: "a" }, { originalPlayerId: "out2", candidatePlayerId: "b" }];
  const multi = { ...scenario, replacements: pairs };
  const combined = branch({ ...improved, minGhostSeparationM: 0.7 }, pairs, { ...baseline, minGhostSeparationM: 3 });
  const output = report([evaluation(multi, [branch(improved, [pairs[0]]), branch(improved, [pairs[1]]), combined])], { scenario: multi });
  assert.equal(output.verdict, "inconclusive");
  assert.equal(output.preferredCandidateId, null);
  assert.equal(output.branches.length, 3);
  assert.equal(output.branches[2].kind, "combined");
  assert.match(output.reasons.join(" "), /within 0.7 m/);
  assert.match(output.actions.join(" "), /Taylor Option for Alex Current on its own/);
  assert.match(output.actions.join(" "), /Jordan Option for Sam Current on its own/);
  assert.equal(output.alternatives[0].verdict, "inconclusive");
  assert.equal(output.alternatives[0].branches.length, 2);
  assert.equal(output.alternatives[0].branches[0].verdict, "replace");
  assert.equal(output.alternatives[0].branches[1].verdict, "inconclusive");
  assert.doesNotMatch(output.summary, /better than.*individual/i);
});

test("multi-option comparisons keep other replacements fixed and use combined effects", () => {
  const pairs = [{ originalPlayerId: "out", candidatePlayerId: "a" }, { originalPlayerId: "out2", candidatePlayerId: "b" }];
  const multi = { ...scenario, replacements: pairs };
  const alternatePairs = [{ ...pairs[0], candidatePlayerId: "c" }, pairs[1]];
  const other = { ...multi, id: "other", replacements: alternatePairs };
  const changedOthers = { ...multi, id: "unrelated-combination", replacements: [pairs[0], { ...pairs[1], candidatePlayerId: "c" }] };
  const originalCombined = { ...baseline, minGhostSeparationM: 3 };
  const output = report([
    evaluation(multi, [branch(improved, [pairs[0]]), branch({ ...improved, minGhostSeparationM: 0.7 }, pairs, originalCombined)]),
    evaluation(other, [branch(improved, [alternatePairs[0]]), branch({ ...improved, minGhostSeparationM: 3 }, alternatePairs, originalCombined)]),
    evaluation(changedOthers, [branch(improved, changedOthers.replacements, originalCombined)]),
  ], { scenario: multi });
  assert.equal(output.verdict, "inconclusive");
  assert.equal(output.alternatives.length, 2);
  assert.equal(output.alternatives.find((entry) => entry.candidateId === "a").verdict, "inconclusive");
  assert.equal(output.alternatives.find((entry) => entry.candidateId === "c").verdict, "replace");
  assert.equal(output.alternatives.find((entry) => entry.candidateId === "c").branches[1].replacements[1].candidateName, "Jordan Option");
});

test("empty input remains usable and does not expose technical placeholder text", () => {
  const output = buildCoachingReport();
  assert.equal(output.verdict, "inconclusive");
  assert.equal(output.windowSeconds, null);
  assert.deepEqual(output.alternatives, []);
  assert.doesNotMatch(JSON.stringify(output), /backend|not connected|undefined|confidence/i);
  assert.ok(output.actions.length);
});
