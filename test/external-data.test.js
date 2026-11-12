import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { normalizeStatsBombMatch } from "../src/data/statsbomb.js";
import { ageOnDate, createExternalService, validDate, valuationAtDate } from "../server/external.js";
import { createApiServer } from "../server/app.js";
import { loadFootballService } from "../server/service.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";

function rawFixture() {
  const events = [
    { period: 1, timestamp: "00:00:00", type: { name: "Starting XI" }, team: { id: 1, name: "A" }, minute: 0, second: 0 },
    { period: 1, timestamp: "00:44:59", type: { name: "Shot" }, team: { id: 1, name: "A" }, player: { id: 11, name: "One" },
      shot: { statsbomb_xg: 0.2, outcome: { name: "Goal" } }, location: [120, 80], minute: 44, second: 59 },
    { period: 1, timestamp: "00:47:00", type: { name: "Half End" }, team: { id: 1, name: "A" }, minute: 47, second: 0 },
    { period: 2, timestamp: "00:00:00", type: { name: "Half Start" }, team: { id: 2, name: "B" }, minute: 45, second: 0 },
    { period: 2, timestamp: "00:00:10", type: { name: "Shot" }, team: { id: 2, name: "B" }, player: { id: 22, name: "Two" },
      shot: { statsbomb_xg: 0.3, outcome: { name: "Saved" } }, minute: 45, second: 10 },
    { period: 2, timestamp: "00:45:00", type: { name: "Half End" }, team: { id: 2, name: "B" }, minute: 90, second: 0 },
    { period: 5, timestamp: "00:00:00", type: { name: "Shot" }, team: { id: 2, name: "B" }, player: { id: 22, name: "Two" },
      shot: { statsbomb_xg: 0.8, outcome: { name: "Goal" }, type: { name: "Penalty" } }, minute: 120, second: 0 },
  ].map((event, i) => ({ id: `event-${i}`, index: i, possession: i + 1, ...event }));
  return { metadata: { match_id: 123, match_date: "2024-07-14", home_team: { home_team_id: 1, home_team_name: "A", home_team_gender: "male" },
    away_team: { away_team_id: 2, away_team_name: "B" }, home_score: 1, away_score: 0 }, events,
  lineups: [{ team_id: 1, team_name: "A", lineup: [{ player_id: 11, player_name: "One", country: { name: "A" }, jersey_number: 1,
    positions: [{ position: "Forward", from: "00:00", from_period: 1, to: "45:00", to_period: 2 },
      { position: "Midfield", from: "45:00", from_period: 2, to: null, to_period: null }] }] },
  { team_id: 2, team_name: "B", lineup: [{ player_id: 22, player_name: "Two", country: { name: "B" }, jersey_number: 2,
    positions: [{ position: "Forward", from: "45:00", from_period: 2, to: null, to_period: null }] }] }] };
}

test("StatsBomb periods form a monotonic timeline; xG windows reset at halftime and exclude shootouts", () => {
  const result = normalizeStatsBombMatch(rawFixture());
  assert.deepEqual(result.events[1].location, { x: 105, y: 68 });
  assert.equal(result.events[4].elapsedSeconds, 2830);
  assert.ok(result.events.every((event, i, all) => i === 0 || event.elapsedSeconds >= all[i - 1].elapsedSeconds));
  assert.deepEqual(result.momentum.totals, { homeXG: 0.2, awayXG: 0.3 });
  assert.equal(result.keyMoments.length, 2);
  const secondHalf = result.momentum.points.find(({ period }) => period === 2);
  assert.equal(secondHalf.homeXG, 0);
  assert.equal(secondHalf.awayXG, 0.3);
  assert.equal(result.players[0].minutesPlayed, 92);
  assert.equal(result.players[1].minutesPlayed, 45);
  assert.equal(result.players[1].stats.goals, 0);
  assert.equal(result.players[1].stats.shots, 1);
  assert.equal(result.players[1].per90.shots, 2);
  assert.equal(result.capabilities.trackingReplay, false);
});

test("missing xG and absent playing time remain unknown instead of invented zeroes", () => {
  const raw = rawFixture();
  delete raw.events[1].shot.statsbomb_xg;
  raw.lineups[0].lineup[0].positions = [];
  const result = normalizeStatsBombMatch(raw);
  assert.equal(result.players[0].stats.xg, null);
  assert.equal(result.players[0].per90.xg, null);
  assert.equal(result.momentum.missingShotXG, 1);
  const bad = rawFixture();
  bad.events[1].shot.statsbomb_xg = 1.1;
  assert.throws(() => normalizeStatsBombMatch(bad), /xG/);
});

test("as-of valuations exclude future records, preserve zeroes and flag conflicts", () => {
  const history = [{ date: "2023-01-01", valueEur: 0 }, { date: "2024-01-01", valueEur: 100 }, { date: "2025-01-01", valueEur: 999 }];
  assert.equal(valuationAtDate(history, "2024-07-14").valueEur, 100);
  assert.equal(valuationAtDate(history, "2023-07-14").valueEur, 0);
  assert.equal(valuationAtDate(history, "2022-01-01").valueEur, null);
  assert.equal(valuationAtDate([...history, { date: "2025-01-01", valueEur: 900 }], "2025-07-01").valueEur, null);
  assert.equal(ageOnDate("2007-07-13", "2024-07-14"), 17);
  assert.equal(ageOnDate("2007-07-13", "2024-07-12"), 16);
  assert.throws(() => validDate("2024-02-30"), /ISO/);
});

test("missing imports return an actionable 503 instead of fabricated sources", () => {
  const service = createExternalService();
  assert.equal(service.getExternalDatasets().statsbomb.ready, false);
  assert.throws(() => service.getEventMatches(), (error) => error.code === "EXTERNAL_DATA_NOT_READY" && error.status === 503);
});

test("real sources are served through the HTTP/client API with historical ID enrichment", async (t) => {
  try { await readFile(new URL("../src/data/external-football.json", import.meta.url)); }
  catch (error) {
    if (error.code === "ENOENT") { t.skip("Run npm run prepare:external for the real dataset check."); return; }
    throw error;
  }
  const service = await loadFootballService();
  const server = createApiServer({ service });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = createGhostXIClient({ baseUrl: `${origin}/api/v1` });
  try {
    const sources = await api.getDatasets();
    assert.equal(sources.statsbomb.matchCount, 4);
    assert.ok(sources.transfermarkt.playerCount > 50_000);
    assert.equal(sources.transfermarkt.curatedPlayerLinkCount, 6);
    assert.ok(sources.files.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
    const matches = await api.getEventMatches();
    assert.deepEqual(matches.map(({ providerId }) => providerId), [3869685, 3943043, 3906390, 4020846]);
    assert.ok(matches.every((m) => m.season !== "2003/2004"));
    await assert.rejects(api.getEventMatch(3749257), (error) => error.status === 404);
    for (const match of matches) {
      const detail = await api.getEventMatch(match.id);
      assert.ok(detail.keyMoments.length > 0);
      assert.equal(detail.capabilities.ghostComparison, false);
      const momentum = await api.getEventMomentum(match.id);
      assert.ok(momentum.points.every(({ value }) => Number.isFinite(value) && Math.abs(value) <= 1));
      const allPlayers = await api.getEventPlayers(match.id);
      const ownGoals = await api.getEvents(match.id, { type: "Own Goal For", limit: 100 });
      assert.equal(allPlayers.reduce((sum, player) => sum + player.stats.goals, 0) + ownGoals.total, match.home.score + match.away.score);
      for (const player of allPlayers.filter(({ marketLink }) => marketLink.status === "curated")) {
        assert.equal(player.marketLink.profile.referenceDate, match.date);
        assert.ok(player.marketLink.profile.marketValue.date <= match.date);
        assert.equal(player.marketLink.profile.simulationEligible, false);
      }
      const shots = await api.getEvents(match.id, { type: "Shot", limit: 5 });
      assert.ok(shots.items.every(({ type }) => type === "Shot"));
      assert.ok(shots.total >= shots.items.length);
    }
    const euroPlayers = await api.getEventPlayers(3943043);
    const yamal = euroPlayers.find(({ providerId }) => providerId === 316046);
    assert.equal(yamal.marketLink.profile.ageAtReferenceDate, 17);
    assert.equal(yamal.marketLink.profile.providerId, "937958");
    assert.ok(euroPlayers.some(({ marketLink }) => marketLink.status === "unlinked"));
    const market = await api.getMarketPlayer("937958", "2024-07-14");
    assert.ok(market.valuations.every(({ date }) => date <= "2024-07-14"));
    assert.equal(market.marketValue.valueEur, 90_000_000);
    const search = await api.getMarketPlayers({ search: "Yamal", maxAge: 18, asOf: "2024-07-14", limit: 10 });
    assert.ok(search.items.some(({ providerId }) => providerId === "937958"));
    assert.ok(search.items.every(({ ageAtReferenceDate }) => ageAtReferenceDate <= 18));
    await assert.rejects(api.getMarketPlayer("937958", "2024-02-30"), (error) => error.status === 400);
    await assert.rejects(api.getEvents(3943043, { limit: 501 }), (error) => error.status === 400);
    const logo = await fetch(`${origin}${sources.statsbomb.logoPath}`);
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get("content-type"), "image/png");
    assert.equal((await logo.arrayBuffer()).byteLength, 120793);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
