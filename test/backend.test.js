import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { createApiServer } from "../server/app.js";
import { createFootballService, loadFootballService } from "../server/service.js";
import { createGhostXIClient, GhostXIApiError } from "../src/client/ghostxi.js";
import { analyzeScenario, buildMomentum, createPossessionValue } from "../src/analytics/decisionSupport.js";
import { simulateAlternative } from "../src/simulation/alternative.js";

function fixture() {
  const home = Array.from({ length: 11 }, (_, index) => `h${index}`);
  const away = Array.from({ length: 11 }, (_, index) => `a${index}`);
  const players = [...home, ...away].map((id) => ({ id, displayName: id, team: home.includes(id) ? "HOME" : "AWAY" }));
  const frames = [0, 1, 2].map((time) => ({ time, sourceFrame: time + 1,
    ball: { x: 4, y: 0 }, players: Object.fromEntries(players.map(({ id }) => [id, { x: 0, y: 0 }])) }));
  return { id: "fixture", name: "Fixture match", pitch: { length: 105, width: 68 }, dataKind: "tracking", fps: 1,
    source: { name: "test fixture", url: "https://example.com/fixture", revision: "test" },
    homeAttacksRightFirstHalf: true, matchEndSeconds: 120, events: [], players, lineup: { home, away },
    moments: [{ id: "moment", title: "Fixture", context: "press", frames, targetPlayerId: home[0],
      candidatePlayerIds: ["lane-reader"], durationSec: 2, startTime: 0, startClock: "00:00", anchor: { x: 2, y: 0 },
      initialVelocity: { x: 0, y: 0 }, action: { team: "HOME", startFrame: 1, endFrame: 3 } }] };
}

function controlledSimulation(match) {
  const baselineFrames = match.moments[0].frames;
  return { baselineFrames, alternativeFrames: baselineFrames.map((frame, index) => {
    const { h0, ...others } = frame.players;
    return { ...frame, players: { ...others, "lane-reader": { x: index * 2, y: 0 } } };
  }), outgoingPlayerId: "h0", incomingPlayerId: "lane-reader",
  tacticalPoints: baselineFrames.map(() => ({ x: 2, y: 0 })), assumptions: ["Controlled fixture"] };
}

test("analytics uses independently calculable distances, value and identical scoring for both players", () => {
  const match = fixture();
  const snapshot = structuredClone(match);
  const simulation = controlledSimulation(match);
  const input = { match, momentId: "moment", simulation, possessionValue: () => 0.5 };
  const result = analyzeScenario(input);
  const metrics = Object.fromEntries(result.metrics.map((metric) => [metric.id, metric]));
  assert.equal(metrics.coverError.baseline, 2);
  assert.equal(metrics.coverError.alternative, 4 / 3);
  assert.equal(metrics.closest.baseline, 4);
  assert.equal(metrics.closest.alternative, 2);
  assert.equal(metrics.accessibleValue.baseline, 0);
  assert.equal(metrics.accessibleValue.alternative, 25);
  assert.equal(result.scouting.baseline.score, 47);
  assert.equal(result.scouting.alternative.score, 72);
  assert.equal(result.scouting.scoreDelta, 25);
  assert.deepEqual(analyzeScenario(input), result);
  assert.deepEqual(match, snapshot);
  match.players[0].age = 19;
  const beforeAgeChange = analyzeScenario(input).scouting;
  match.players[0].age = 35;
  assert.deepEqual(analyzeScenario(input).scouting, beforeAgeChange);
});

test("equal trajectories give no clear improvement and empty action windows are refused", () => {
  const match = fixture();
  const simulation = controlledSimulation(match);
  simulation.alternativeFrames.forEach((frame) => { frame.players["lane-reader"] = { x: 0, y: 0 }; });
  const result = analyzeScenario({ match, momentId: "moment", simulation, possessionValue: () => 0 });
  assert.equal(result.scouting.scoreDelta, 0);
  assert.equal(result.recommendation.decision, "No clear improvement");
  match.moments[0].action.startFrame = 50;
  assert.throws(() => analyzeScenario({ match, momentId: "moment", simulation, possessionValue: () => 0 }), /action window/);
});

test("second-half action valuation reverses the direction", () => {
  const match = fixture();
  match.moments[0].period = 2;
  const directions = [];
  analyzeScenario({ match, momentId: "moment", simulation: controlledSimulation(match), possessionValue: (_point, direction) => {
    directions.push(direction); return 0.5;
  } });
  assert.ok(directions.length > 0);
  assert.ok(directions.every((direction) => direction === false));
});

test("simulation rejects duplicate timestamps, incomplete frames, invalid coordinates and candidates", () => {
  for (const corrupt of [
    (match) => { match.moments[0].frames[1].time = 0; },
    (match) => { delete match.moments[0].frames[0].players.h1; },
    (match) => { match.moments[0].frames[0].ball.x = NaN; },
    (match) => { match.moments[0].frames[0].players.h0.x = 106; },
    (match) => { match.players.push({ ...match.players[0] }); },
  ]) {
    const match = fixture(); corrupt(match);
    assert.throws(() => simulateAlternative({ match, momentId: "moment", candidateId: "lane-reader" }));
  }
  assert.throws(() => simulateAlternative({ match: fixture(), momentId: "moment", candidateId: "unknown" }), /replacement/);
});

test("momentum formula has known rolling values, reverses halves, and handles empty events", () => {
  const match = fixture();
  match.events = [
    { team: "HOME", period: 1, time: 0, location: { x: 10, y: 10 } },
    { team: "AWAY", period: 1, time: 60, location: { x: 10, y: 10 } },
    { team: "HOME", period: 2, time: 120, location: { x: 10, y: 10 } },
  ];
  assert.deepEqual(buildMomentum(match, (_point, right) => right ? 2 : 1), [
    { minute: 0, value: 1 }, { minute: 1, value: 0.5 }, { minute: 2, value: 1 },
  ]);
  assert.ok(buildMomentum({ ...match, events: [] }, () => 0).every(({ value }) => value === 0));
  match.events[0].time = -1;
  assert.throws(() => buildMomentum(match, () => 1), /time inside/);
});

test("EPV rejects blank/nonfinite cells and nonfinite lookup coordinates", () => {
  const grid = Array.from({ length: 32 }, () => new Array(50).fill("0.5").join(",")).join("\n");
  const pitch = { length: 105, width: 68 };
  assert.throws(() => createPossessionValue(grid.replace("0.5", ""), pitch), /empty/);
  assert.throws(() => createPossessionValue(grid.replace("0.5", "NaN"), pitch), /grid is invalid/);
  assert.throws(() => createPossessionValue(grid, pitch)({ x: NaN, y: 0 }, true), /finite/);
});

test("scouting averages comparable scenarios only and service results cannot mutate its recording", () => {
  const recording = fixture();
  recording.moments.push({ ...structuredClone(recording.moments[0]), id: "second" });
  recording.moments.push({ ...structuredClone(recording.moments[0]), id: "attack", context: "attack" });
  const grid = Array.from({ length: 32 }, () => new Array(50).fill("0.5").join(",")).join("\n");
  const service = createFootballService({ recording, grid });
  const report = service.getScouting("fixture", "lane-reader");
  assert.equal(report.overallScore, null);
  assert.equal(report.groups.length, 2);
  assert.deepEqual(report.groups[0].weights.map(({ weight }) => weight), [0.5, 0.5]);
  const first = service.getScenario("fixture", "moment");
  first.frames[0].ball.x = 99;
  assert.equal(service.getScenario("fixture", "moment").frames[0].ball.x, 4);
});

let server;
let baseUrl;
let client;
before(async () => {
  server = createApiServer({ service: await loadFootballService(), allowedOrigins: ["http://localhost:5173"] });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  client = createGhostXIClient({ baseUrl: `${baseUrl}/api/v1` });
});
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

test("legacy replay metadata remains observed and fictional comparisons are retired", async () => {
  assert.equal((await (await fetch(`${baseUrl}/health`)).json()).data.dataReady, true);
  const [summary] = await client.getMatches();
  const match = await client.getMatch(summary.id);
  assert.equal(match.moments.length, 3);
  assert.equal(match.players.length, 22);
  assert.ok(match.players.every((p) => p.dataKind === "OBSERVED"));
  for (const moment of match.moments) {
    const scenario = await client.getScenario(match.id, moment.id);
    assert.equal(scenario.frames.length, 201);
    assert.deepEqual(scenario.candidatePlayerIds, []);
    const candidates = await client.getCandidates(match.id, moment.id);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((p) => p.provenance && !p.id.includes("lane-reader")));
  }
  await assert.rejects(client.compare({matchId: match.id, momentId: match.moments[0].id, candidateId: "lane-reader"}), (e) => e.status === 410);
  assert.equal((await client.getMomentum(match.id)).points.length, 96);
  assert.equal((await client.getMethodology()).version, "1.0.0");
});

test("API restricts browser origins and supports comparison preflight", async () => {
  const allowed = await fetch(`${baseUrl}/api/v1/matches`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const denied = await fetch(`${baseUrl}/api/v1/matches`, { headers: { Origin: "https://unlisted.example" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const preflight = await fetch(`${baseUrl}/api/v1/comparisons`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

test("invalid JSON, identifiers, methods and unknown fields return structured errors", async () => {
  await assert.rejects(client.getMatch("missing"), (error) => error instanceof GhostXIApiError && error.status === 404 && error.code === "REPLAY_NOT_AVAILABLE");
  await assert.rejects(client.compare({ matchId: "metrica-game-1", momentId: "home-wide-interception", candidateId: "wide-runner" }),
    (error) => error.status === 410);
  for (const [body, status] of [["{", 400], ["null", 400], [JSON.stringify({ matchId: "x", momentId: "y", candidateId: "z", token: "extra" }), 400], [" ".repeat(20_000), 413]]) {
    const response = await fetch(`${baseUrl}/api/v1/comparisons`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error.code, "string");
  }
  const noJson = await fetch(`${baseUrl}/api/v1/comparisons`, { method: "POST", body: "{}" });
  assert.equal(noJson.status, 415);
  const wrongMethod = await fetch(`${baseUrl}/api/v1/comparisons`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
  assert.equal((await fetch(`${baseUrl}/api/v1/matches?unexpected=1`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/v1/matches/metrica-game-1/scouting`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/v1/matches/metrica-game-1/scenarios/%zz`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/.env`)).status, 404);
});
