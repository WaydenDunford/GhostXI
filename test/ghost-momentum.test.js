import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { buildGhostMomentum } from "../src/analytics/ghostMomentum.js";
import { createFootballService } from "../server/service.js";
import { createApiServer } from "../server/app.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";
import { normalizeSkillCorner } from "../src/data/skillcorner.js";

const teams = [{ id: "HOME", name: "Test home" }, { id: "AWAY", name: "Test away" }];
const players = [{ id: "h", teamId: "HOME" }, { id: "a", teamId: "AWAY" }];
const frame = (timeSec, homeX = 58, awayX = 58) => ({ timeSec, ball: { x: 50, y: 50 }, players: { h: { x: homeX, y: 50 }, a: { x: awayX, y: 50 } } });
const window = { period: 2, startPeriodTimeSec: 123, startMatchTimeSec: 2823, startElapsedTimeSec: 2910 };
const branch = (id, frames, outgoing = "h", incoming = "candidate") => ({ id, frames: frames.map((f) => {
  const result = structuredClone(f);
  result.players[incoming] = result.players[outgoing];
  delete result.players[outgoing];
  return result;
}), replacements: [{ originalPlayerId: outgoing, candidatePlayerId: incoming }] });
const run = (originalFrames, branches, extra = {}) => buildGhostMomentum({ matchId: "test", scenarioId: "scenario",
  pitch: { length: 100, width: 100 }, teams, players, originalFrames, branches, window, ...extra });
const near = (actual, expected, epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test("known geometry uses metres and home-positive normalized ball-access pressure", () => {
  const frames = [frame(0, 50, 58), frame(1, 50, 58)];
  const result = run(frames, [branch("same", frames)]);
  const expected = (1 - Math.exp(-1)) / (1 + Math.exp(-1));
  for (const point of result.branches[0].points) {
    near(point.original, expected); assert.equal(point.delta, 0);
  }
  const wider = run(frames, [branch("same", frames)], { pitch: { length: 200, width: 100 } });
  near(wider.branches[0].points[0].original, (1 - Math.exp(-2)) / (1 + Math.exp(-2)));
  assert.deepEqual(result.window, { ...window, durationSec: 1 });
  assert.equal(result.branches[0].points[1].matchTimeSec, 2824);
  assert.equal(result.branches[0].points[1].elapsedTimeSec, 2911);
});

test("smoothing is causal and weighted by actual irregular sample durations", () => {
  const frames = [frame(0), frame(.2, 50), frame(1, 50), frame(1.2, 50)];
  const result = run(frames, [branch("same", frames)]);
  const raw = (1 - Math.exp(-1)) / (1 + Math.exp(-1));
  near(result.branches[0].points[1].original, 0);
  near(result.branches[0].points[2].original, raw * .8);
  near(result.branches[0].points[3].original, raw);
  const prefix = run(frames.slice(0, 3), [branch("same", frames.slice(0, 3))]);
  assert.deepEqual(prefix.branches[0].points, result.branches[0].points.slice(0, 3));
});

test("identity-only replacements have exactly zero delta and never mutate source or branches", () => {
  const roster = Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, teamId: i < 11 ? "HOME" : "AWAY" }));
  const frames = [0, .3, .8, 1.1].map((timeSec) => ({ timeSec, ball: { x: 50, y: 50 },
    players: Object.fromEntries(roster.map((p, i) => [p.id, { x: 10 + i * 3.5, y: 7 + i * 4 }])) }));
  const branches = [branch("renamed", frames, "p0")];
  const input = { frames: structuredClone(frames), branches: structuredClone(branches) };
  const result = run(frames, branches, { players: roster });
  assert.ok(result.branches[0].points.every((p) => p.delta === 0));
  assert.equal(result.branches[0].summary.delta, 0);
  assert.equal(result.branches[0].summary.peakDelta, 0);
  assert.deepEqual(frames, input.frames); assert.deepEqual(branches, input.branches);
});

test("home and away replacements use the outgoing team, not the candidate historical club", () => {
  const frames = [frame(0, 66, 66), frame(1, 66, 66)];
  const home = branch("home", frames);
  const away = branch("away", frames, "a", "away-candidate");
  for (const f of home.frames) f.players.candidate.x = 50;
  for (const f of away.frames) f.players["away-candidate"].x = 50;
  const roster = [...players, { id: "candidate", teamId: "AWAY" }, { id: "away-candidate", teamId: "HOME" }];
  const result = run(frames, [home, away], { players: roster });
  assert.ok(result.branches[0].summary.delta > 0);
  assert.ok(result.branches[1].summary.delta < 0);
  near(result.branches[0].summary.delta, -result.branches[1].summary.delta);
});

test("multiple branches each use their own returned trajectory, including a combined branch", () => {
  const roster = [...players, { id: "h2", teamId: "HOME" }];
  const frames = [frame(0, 66, 66), frame(1, 66, 66)].map((f) => ({ ...f, players: { ...f.players, h2: { x: 66, y: 50 } } }));
  const first = branch("individual:1", frames);
  const second = branch("individual:2", frames, "h2", "candidate2");
  for (const f of first.frames) f.players.candidate.x = 58;
  for (const f of second.frames) f.players.candidate2.x = 50;
  const combined = { id: "combined", replacements: [...first.replacements, ...second.replacements],
    frames: first.frames.map((f) => {
      const copy = structuredClone(f); delete copy.players.h2;
      copy.players.candidate2 = { x: 54, y: 50 }; return copy;
    }) };
  const result = run(frames, [first, second, combined], { players: roster });
  assert.deepEqual(result.branches.map((b) => b.branchId), ["individual:1", "individual:2", "combined"]);
  for (const output of result.branches) {
    assert.ok(output.points.every((p) => p.original >= -1 && p.original <= 1 && p.ghost >= -1 && p.ghost <= 1));
    assert.ok(output.summary.delta > 0);
  }
  assert.notEqual(result.branches[0].summary.delta, result.branches[1].summary.delta);
  assert.notEqual(result.branches[2].summary.delta, result.branches[0].summary.delta + result.branches[1].summary.delta);
  const misaligned = structuredClone(first); misaligned.frames[1].timeSec += .1;
  assert.throws(() => run(frames, [misaligned], { players: roster }), /timestamps/);
});

test("actual HTTP simulation returns momentum recomputable from every exact ghost branch", async () => {
  const json = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
  const recording = await json("metrica-game1.json");
  const service = createFootballService({ recording, external: await json("external-football.json"),
    grid: await readFile(new URL("../src/data/fot/EPV_grid.csv", import.meta.url), "utf8") });
  const server = createApiServer({ service }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const api = createGhostXIClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` });
  try {
    const scenario = await api.createSavedScenario({ sportId: "football", matchId: recording.id,
      momentId: "home-wide-interception", seed: 42, replacements: [
        { originalPlayerId: "Player2", candidatePlayerId: "statsbomb:30714" },
        { originalPlayerId: "Player3", candidatePlayerId: "statsbomb:3009" },
      ] });
    const sourceBefore = await api.getReplayTracking(recording.id, { momentId: scenario.momentId, limit: 2000 });
    const result = await api.simulateSavedScenario(scenario.id);
    assert.equal(result.momentum.kind, "SIMULATED");
    assert.equal(result.momentum.scenarioId, scenario.id);
    assert.equal(result.momentum.window.startMatchTimeSec, sourceBefore.frames[0].matchTimeSec);
    assert.equal(result.momentum.window.durationSec, 8);
    const match = await api.getReplayMatch(recording.id);
    const rebuilt = buildGhostMomentum({ matchId: recording.id, scenarioId: scenario.id, pitch: match.pitch,
      teams: match.teams, players: match.players, originalFrames: result.originalFrames,
      branches: result.branches, window: result.momentum.window });
    assert.deepEqual(result.momentum.branches, rebuilt.branches);
    assert.equal(result.momentum.branches.length, 3);
    assert.ok(result.momentum.branches.every((b) => b.points.length === result.originalFrames.length));
    assert.ok(result.momentum.branches.some((b) => b.points.some((p) => p.delta !== 0)));
    assert.deepEqual(await api.getReplayTracking(recording.id, { momentId: scenario.momentId, limit: 2000 }), sourceBefore);
    assert.deepEqual((await api.simulateSavedScenario(scenario.id)).momentum, result.momentum);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("SkillCorner second-half anchors use source match timestamps and event elapsedSeconds, not frame/fps", async () => {
  const root = new URL("../", import.meta.url);
  const readJSON = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
  const config = await readJSON("config/skillcorner-sources.json");
  const matches = await Promise.all(config.matchIds.map(async (id) => normalizeSkillCorner(await readJSON(`src/data/skillcorner/replays/${id}.json`))));
  const match = matches.find((m) => m.events.some((e) => e.aligned && e.period === 2));
  assert.ok(match, "prepared source fixtures must include a second-half window");
  const event = match.events.find((e) => e.aligned && e.period === 2);
  const recording = await readJSON("src/data/metrica-game1.json");
  const service = createFootballService({ recording, skillcorner: matches,
    external: await readJSON("src/data/external-football.json"),
    grid: await readFile(new URL("src/data/fot/EPV_grid.csv", root), "utf8") });
  const momentId = `event:${event.id}`;
  const page = service.getReplayTracking(match.id, { momentId, limit: 2000 });
  const outgoing = Object.keys(page.frames[0].players).find((id) => page.frames[0].players[id] !== null
    && service.getReplacementCandidates({ matchId: match.id, replacePlayerId: id, momentId }).length > 0);
  const candidate = service.getReplacementCandidates({ matchId: match.id, replacePlayerId: outgoing, momentId })[0];
  const saved = await service.createSavedScenario({ sportId: "football", matchId: match.id, momentId, seed: 42,
    originalPlayerId: outgoing, candidatePlayerId: candidate.id });
  const result = await service.simulateSavedScenario(saved.id);
  assert.equal(result.momentum.window.period, 2);
  assert.equal(result.momentum.window.startMatchTimeSec, page.frames[0].matchTimeSec);
  near(result.momentum.window.startElapsedTimeSec, event.elapsedSeconds + page.frames[0].periodTimeSec - event.periodTimeSec);
  assert.notEqual(result.momentum.window.startMatchTimeSec, page.frames[0].sourceFrame / match.fps);
  assert.equal(result.momentum.branches[0].points.at(-1).matchTimeSec, page.frames[0].matchTimeSec + 8);
});
