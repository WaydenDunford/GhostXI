import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { once } from "node:events";
import { eventTags, rankPlayerMoments } from "../src/recommendation/ranking.js";
import { positionFit } from "../src/recommendation/config.js";
import { createScenarioStore } from "../server/scenario-store.js";
import { loadFootballService } from "../server/service.js";
import { createApiServer } from "../server/app.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";

const window = (id, start, tags, extra = {}) => ({ id, period: 1, startSec: start, endSec: start + 8,
  timeSec: start + 3, title: id, description: "Fixture evidence", tags, momentumDelta: 0,
  involvement: 0.5, opportunity: 0.5, dataCoverage: 0.35, dataStatus: "estimated", evidence: "A recorded event exists.", ...extra });

test("moment ranking varies by position, normalizes components and rejects invalid weights", () => {
  const windows = [window("pass", 0, ["progressive_pass"]), window("shot", 20, ["shot_stopping"])];
  const midfielder = rankPlayerMoments({ matchId: "m", playerId: "p", position: "central midfielder", windows });
  const keeper = rankPlayerMoments({ matchId: "m", playerId: "p", position: "goalkeeper", windows });
  assert.equal(midfielder[0].id, "pass"); assert.equal(keeper[0].id, "shot");
  assert.ok(midfielder.every(({ relevanceScore }) => relevanceScore >= 0 && relevanceScore <= 1));
  assert.ok(midfielder[0].relevanceReasons.some((reason) => reason.includes("0.25")));
  assert.throws(() => rankPlayerMoments({ matchId: "m", playerId: "p", position: "midfielder", windows,
    weights: { momentum: 1, position: 1, involvement: 1, opportunity: 1, coverage: 1 } }), /sum to one/);
  assert.deepEqual(rankPlayerMoments({ matchId: "m", playerId: "p", position: "midfielder", windows: [] }), []);
  assert.ok(!eventTags({ type: "Carry", location: { x: 50, y: 30 }, carry: { endLocation: { x: 40, y: 30 } } }).includes("progressive_carry"));
  assert.ok(eventTags({ type: "Carry", location: { x: 50, y: 30 }, carry: { endLocation: { x: 60, y: 30 } } }).includes("progressive_carry"));
});

test("recommendations filter duplicate/heavily overlapping windows rather than padding to five", () => {
  const windows = [window("same", 0, ["progressive_pass"], { involvement: 1 }), window("overlap", 2, ["progressive_pass"]),
    window("separate", 20, ["progressive_pass"]), window("same-again", 0, ["progressive_pass"]), window("same", 40, ["progressive_pass"])];
  const ranked = rankPlayerMoments({ matchId: "m", playerId: "p", position: "midfielder", windows, limit: 5 });
  assert.deepEqual(ranked.map(({ id }) => id), ["same", "separate"]);
  assert.equal(positionFit("midfielder", "Right Defensive Midfield"), 1);
  assert.equal(positionFit("CM", "DM"), 1);
  assert.equal(positionFit("midfielder", "goalkeeper"), 0);
  assert.equal(positionFit("midfielder", "unknown"), null);
  assert.equal(positionFit("midfielder", "Right Wing", ["Center Attacking Midfield"]), 0.8);
});

async function temporaryStore() {
  const root = fileURLToPath(new URL("../work/", import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "scenario-test-"));
  const filePath = join(directory, "scenarios.json");
  return { filePath, async cleanup() {
    try { await unlink(filePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rmdir(directory); // only an empty directory created by this test; no recursive deletion
  } };
}

test("JSON persistence serializes concurrent creates and atomic partial updates", async () => {
  const temporary = await temporaryStore();
  try {
    const store = createScenarioStore({ filePath: temporary.filePath });
    const rows = await Promise.all(Array.from({ length: 10 }, (_, i) => store.create({ seed: i, sportId: "football" })));
    assert.equal((await store.list()).length, 10);
    const id = rows[0].id;
    await Promise.all([store.update(id, (row) => ({ ...row, seed: 99 })), store.update(id, (row) => ({ ...row, sportId: "updated" }))]);
    const reopened = createScenarioStore({ filePath: temporary.filePath });
    assert.equal((await reopened.get(id)).seed, 99);
    assert.equal((await reopened.get(id)).sportId, "updated");
    await reopened.delete(id);
    assert.equal((await createScenarioStore({ filePath: temporary.filePath }).list()).length, 9);
  } finally { await temporary.cleanup(); }
});

