import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { normalizeSkillCorner } from "../src/data/skillcorner.js";
import { validateReplay } from "../src/data/replay.js";
import { createFootballService } from "../server/service.js";
import { createApiServer } from "../server/app.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";
import { simulateGhostBranch } from "../src/simulation/multi-ghost.js";

const root = new URL("../", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const config = await json("config/skillcorner-sources.json");

test("10 Hz source frames tolerate floating-point timestamp error but still reject real gaps", () => {
  const frames = [0, .1, .2, .3, .4000000000000341].map((time) => ({ time, ball: {x: 20,y: 30}, players: { a: {x: 10,y: 20}, b: {x: 30,y: 40} } }));
  const input = { frames, pitch: {length: 105,width: 68}, replacements: [{originalPlayerId: "a", candidatePlayerId: "ghost"}] };
  assert.equal(simulateGhostBranch(input).frames.length, 5);
  const gap = structuredClone(input); gap.frames[4].time = .5;
  assert.throws(() => simulateGhostBranch(gap), /tracking gap/);
});

test("named 2025 tracking: exact source identities, coordinates, provenance, HTTP replay and ghost isolation", async (t) => {
  let bundles;
  try { bundles = await Promise.all(config.matchIds.map((id) => json(`src/data/skillcorner/replays/${id}.json`))); }
  catch (e) { if (e.code === "ENOENT") { t.skip("Run npm run prepare:tracking for the source acceptance check."); return; } throw e; }
  const matches = bundles.map(normalizeSkillCorner);
  for (const [i, match] of matches.entries()) {
    const raw = bundles[i], quality = validateReplay(match);
    assert.equal(quality.playable, true); assert.equal(quality.segments.length, 5);
    assert.equal(match.frames.length, 405); assert.match(match.date, /^2025-05-/);
    const first = raw.windows[0].frames[0], sourcePlayer = first.player_data[0];
    const normalized = match.frames[0], id = `skillcorner:${sourcePlayer.player_id}`;
    assert.equal(normalized.players[id].x, (sourcePlayer.x / raw.metadata.pitch_length + .5) * 100);
    assert.equal(normalized.players[id].y, (.5 - sourcePlayer.y / raw.metadata.pitch_width) * 100);
    assert.equal(normalized.playerProvenance[id], sourcePlayer.is_detected ? "OBSERVED" : "ESTIMATED");
    assert.equal(normalized.quality.detectedPlayers + normalized.quality.extrapolatedPlayers, 22);
    assert.equal(match.players.find((p) => p.id === id).jerseyNumber, raw.metadata.players.find((p) => p.id === sourcePlayer.player_id).number);
    assert.ok(match.players.some((p) => normalized.players[p.id] === null)); // bench stays absent, not assigned formation coordinates
    assert.ok(match.frames.some((f) => f.dataStatus === "ESTIMATED"));
    assert.equal(match.events.filter((e) => e.aligned).length, 5);
    const unknown = structuredClone(raw); unknown.windows[0].frames[0].player_data[0].player_id = -1;
    assert.throws(() => normalizeSkillCorner(unknown), /unknown/);
  }
  const service = createFootballService({ recording: await json("src/data/metrica-game1.json"),
    grid: await readFile(new URL("src/data/fot/EPV_grid.csv", root), "utf8"), skillcorner: matches });
  const server = createApiServer({ service }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const api = createGhostXIClient({baseUrl: `http://127.0.0.1:${server.address().port}/api/v1`});
  try {
    const match = await api.getReplayMatch("skillcorner:2017461");
    assert.deepEqual(match.score, {home: 0,away: 1}); assert.equal(match.date, "2025-05-17");
    const selected = match.players.find((p) => p.name === "Nishan Velupillay"); assert.equal(selected.jerseyNumber, 17);
    const moments = await api.getRecommendedMoments(match.id, {playerId: selected.id}); assert.equal(moments.length, 5);
    const momentId = moments[0].id;
    const page = await api.getReplayTracking(match.id, {momentId, limit: 2000}); assert.equal(page.frames.length, 81);
    assert.equal(page.frames.at(-1).periodTimeSec - page.frames[0].periodTimeSec, 8);
    const momentum = await api.getMomentum(match.id);
    assert.ok(momentum.points.length > 500); assert.ok(momentum.points.every((p,i,a) => i === 0 || p.minute >= a[i-1].minute));
    const candidates = await api.getReplacementCandidates({matchId: match.id,replacePlayerId: selected.id,momentId});
    assert.ok(candidates.length > 0); assert.ok(candidates.every((p) => page.frames[0].players[p.id] == null));
    const scenario = await api.createSavedScenario({sportId:"football",matchId:match.id,momentId,originalPlayerId:selected.id,candidatePlayerId:candidates[0].id,seed:42});
    const result = await api.simulateSavedScenario(scenario.id);
    assert.equal(result.originalDataStatus, "ESTIMATED"); assert.equal(result.originalFrames.length, 81);
    const again = await api.getReplayTracking(match.id, {momentId,limit:2000}); assert.deepEqual(again.frames,page.frames);
    for (const [index, original] of result.originalFrames.entries()) {
      const alt = result.alternativeFrames[index]; assert.equal(Object.keys(alt.players).length,22);
      assert.deepEqual(alt.ball,original.ball);
      for (const [id,p] of Object.entries(original.players)) if (id !== selected.id) assert.deepEqual(alt.players[id],p);
    }
    assert.equal((await api.getSavedScenario(scenario.id)).matchId, match.id);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
