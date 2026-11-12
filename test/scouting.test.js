import assert from "node:assert/strict";
import { test } from "node:test";
import { indexByBirthdate, linkTransfermarkt, normaliseName, parseCsv, seasonValuation } from "../scripts/scouting/sources.js";
import { dedupeGroup, measureGroup, percentile, settingsFromMeasures } from "../scripts/scouting/profile.js";
import { pickShortlists } from "../scripts/scouting/shortlist.js";
import { attachCandidates } from "../src/data/scouting.js";

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test("parseCsv keeps quoted commas and doubled quotes", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [{ a: "x, y", b: 'say "hi"' }]);
});

test("normaliseName strips accents, case and extra spaces", () => {
  assert.equal(normaliseName("Aleksandar Šušnjar"), "aleksandar susnjar");
  assert.equal(normaliseName("Storm  Roux"), "storm roux");
});

test("linkTransfermarkt needs the birthdate and refuses ambiguous names", () => {
  const behich = { player_id: "1", name: "Aziz Eraltay Behich", date_of_birth: "1990-12-16 00:00:00" };
  const index = indexByBirthdate([behich, { player_id: "2", name: "Bob Behich", date_of_birth: "1990-12-16" }]);
  assert.equal(linkTransfermarkt({ player_name: "Aziz Behich", player_short_name: "A. Behich", player_birthdate: "1990-12-16" }, index), behich);
  assert.equal(linkTransfermarkt({ player_name: "Aziz Behich", player_short_name: "", player_birthdate: "1990-12-17" }, index), null);
  const twins = indexByBirthdate([
    { player_id: "3", name: "Sam Jones", date_of_birth: "1999-01-01" },
    { player_id: "4", name: "Steve Jones", date_of_birth: "1999-01-01" },
  ]);
  assert.equal(linkTransfermarkt({ player_name: "S Jones", player_short_name: "S. Jones", player_birthdate: "1999-01-01" }, twins), null);
});

test("seasonValuation uses the last 2024/25 value and flags older ones", () => {
  const rows = [
    { date: "2024-03-01", market_value_in_eur: "300000", current_club_name: "A" },
    { date: "2024-12-15", market_value_in_eur: "450000", current_club_name: "B" },
    { date: "2025-06-30", market_value_in_eur: "500000", current_club_name: "B" },
    { date: "2025-09-01", market_value_in_eur: "700000", current_club_name: "C" },
  ];
  assert.deepEqual(seasonValuation(rows), { eur: 500000, date: "2025-06-30", club: "B", older: false });
  assert.deepEqual(seasonValuation([{ date: "2023-05-31", market_value_in_eur: "600000", current_club_name: "AEK Larnaca" }]),
    { eur: 600000, date: "2023-05-31", club: "AEK Larnaca", older: true });
  assert.equal(seasonValuation([]), null);
});

test("percentile counts values strictly worse", () => {
  close(percentile(30, [26, 28, 30, 32], true), 2 / 3);
  close(percentile(1.2, [1.2, 1.4, 1.6], false), 1);
  close(percentile(5, [5], true), 0.5);
});

test("settings follow the spec's formulas", () => {
  assert.deepEqual(settingsFromMeasures({ psv99Kmh: 30.6, sprintPercentile: 0.75, oopPercentile: 0.5 }),
    { topSpeed: 8.5, acceleration: 5.5, reaction: 0.24, engageRange: 6 });
});

test("missing measures use the position median and are marked", () => {
  const row = (player_id, psv99, timetosprint_top3, hi_distance_full_otip) => ({ player_id, position_group: "Full Back",
    psv99, timetosprint_top3, hi_distance_full_otip, minutes_full_otip: "30", minutes_full_all: "90", count_match: "10", team_id: "1" });
  const m = measureGroup([row("A", "30", "1.3", "300"), row("B", "28", "", "240"), row("C", "32", "1.5", "")]);
  close(m.get("A").psv99Percentile, 0.5); close(m.get("A").sprintPercentile, 1); close(m.get("A").oopHiPerMin, 10);
  close(m.get("B").sprintPercentile, 0.5); assert.deepEqual(m.get("B").filled, ["timeToSprint"]);
  close(m.get("C").oopPercentile, 0.5); assert.deepEqual(m.get("C").filled, ["outOfPossession"]);
});

test("dedupeGroup keeps the club row with more matches", () => {
  const rows = [{ player_id: "9", position_group: "Full Back", count_match: "4", minutes_full_all: "90", team_id: "1" },
    { player_id: "9", position_group: "Full Back", count_match: "12", minutes_full_all: "80", team_id: "2" }];
  assert.equal(dedupeGroup(rows, "Full Back")[0].team_id, "2");
});

// id, top speed, out-of-possession intensity, time to sprint, mean percentile, market value (k€), older, minutes
function scenario(scenarioId, players) {
  const rows = players.map(([id, , , , , , , minutes = 900]) => ({ player_id: id, minutes_full_all: String(minutes / 10), count_match: "10" }));
  const measures = new Map(players.map(([id, psv99Kmh, oopHiPerMin, timeToSprintS, pct]) => [id,
    { psv99Kmh, oopHiPerMin, timeToSprintS, psv99Percentile: pct, oopPercentile: pct, sprintPercentile: pct }]));
  const values = players.map(([id, , , , , eur, older = false]) => [id, eur === null ? null : { eur: eur * 1000, older }]);
  return { scenarioId, rows, measures, values };
}
function shortlist(...scenarios) {
  return pickShortlists(scenarios.map(({ scenarioId, rows }) => ({ scenarioId, rows })),
    new Map(scenarios.map(({ scenarioId, measures }) => [scenarioId, measures])),
    new Map(scenarios.flatMap(({ values }) => values)));
}

test("each scenario gets four different picks and no player appears twice", () => {
  const first = scenario("first", [["7", 33, 9, 1.5, 0.6, 900], ["1", 30, 12, 1.6, 0.5, 800], ["2", 29, 8, 1.1, 0.5, 700],
    ["3", 28, 7, 1.4, 0.9, 200], ["4", 27, 6, 1.3, 0.5, 300], ["5", 26, 5, 1.2, 0.4, 400]]);
  const second = scenario("second", [["7", 33, 9, 1.5, 0.6, 900], ["11", 31, 10, 1.5, 0.5, 500], ["12", 30, 11, 1.6, 0.5, 600],
    ["13", 29, 9, 1.0, 0.5, 700], ["14", 28, 8, 1.4, 0.8, 100], ["15", 27, 7, 1.3, 0.3, 800]]);
  const result = shortlist(first, second);
  assert.deepEqual(result.first, [{ playerId: "7", pick: "fastest" }, { playerId: "1", pick: "outOfPossession" },
    { playerId: "2", pick: "acceleration" }, { playerId: "3", pick: "hiddenTalent" }]);
  assert.deepEqual(result.second.map(({ playerId }) => playerId), ["11", "12", "13", "14"]);
});

test("the hidden talent must have a current 2024/25 value below the median", () => {
  const result = shortlist(scenario("only", [["1", 33, 12, 1.0, 0.5, 900], ["2", 30, 11, 1.1, 0.5, 800],
    ["3", 29, 10, 1.9, 0.99, 150, true], ["4", 28, 9, 1.2, 0.7, 200], ["5", 27, 8, 1.4, 0.6, 300], ["6", 26, 7, 1.5, 0.95, 900]]));
  assert.deepEqual(result.only.find(({ pick }) => pick === "hiddenTalent"), { playerId: "5", pick: "hiddenTalent" });
});

test("ties go to the lower numeric id and short careers are never picked", () => {
  const result = shortlist(scenario("only", [["12", 31, 5, 1.5, 0.5, 500], ["9", 31, 4, 1.6, 0.5, 500],
    ["40", 35, 20, 0.9, 0.9, 100, false, 899]]));
  assert.equal(result.only[0].playerId, "9");
  assert.ok(result.only.every(({ playerId }) => playerId !== "40"));
});

test("attachCandidates adds the shortlists without touching its inputs", () => {
  const recording = { pitch: { length: 105, width: 68 }, players: [{ id: "P1", displayName: "Home 1", team: "HOME" }],
    moments: [{ id: "m1", frames: [] }, { id: "m2", frames: [] }] };
  const candidate = { id: "sc-1", name: "Jane Doe", club: "Perth Glory", positionGroup: "Full Back", age: 24,
    settings: { topSpeed: 8, acceleration: 5, reaction: 0.3, engageRange: 6 } };
  const scouting = { shortlists: { m1: ["sc-1"], m2: ["sc-1"] }, candidates: [candidate] };
  const before = structuredClone({ recording, scouting });
  const match = attachCandidates(recording, scouting);
  assert.deepEqual(match.moments.map(({ candidatePlayerIds }) => candidatePlayerIds), [["sc-1"], ["sc-1"]]);
  assert.deepEqual(match.players.at(-1), { id: "sc-1", displayName: "Jane Doe (Perth Glory)", team: "HOME", role: "Full Back",
    age: 24, settings: candidate.settings, scouting: candidate });
  assert.deepEqual({ recording, scouting }, before);
  assert.throws(() => attachCandidates(recording, { ...scouting, shortlists: { m1: ["sc-1"] } }),
    { message: "No scouting shortlist for moment 'm2'." });
});
