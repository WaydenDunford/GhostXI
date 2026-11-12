import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEuros, scoutingCardLines } from "../src/ui/scoutingCard.js";

const player = (overrides = {}) => ({
  scouting: {
    name: "Daniel Hall", club: "Auckland FC", clubNow: "JEF United", positionGroup: "Central Defender", age: 26,
    transfermarkt: { position: "Defender", subPosition: "Centre-Back", foot: "left", heightCm: 191,
      marketValue: { eur: 400000, date: "2025-06-03", club: "Auckland FC", older: false } },
    measured: { psv99Kmh: 30.87, psv99Percentile: 0.94, timeToSprintS: 1.28, sprintPercentile: 0.857, oopHiPerMin: 12.44,
      oopPercentile: 0.544, offBallRunsPer30: 1.23, runsInBehindPer30: 0.2, passCompletion: 0.876, lineBreakingPer30: 2.5 },
    national: { caps: 0, goals: 0, team: null, citizenship: "Australia" },
    ...overrides,
  },
});
const text = (lines) => lines.map((line) => line.text);

test("the card shows identity, value and measured numbers in a fixed order", () => {
  assert.deepEqual(text(scoutingCardLines(player())), [
    "Daniel Hall",
    "Auckland FC · now at JEF United",
    "Age 26 · Centre-Back · left-footed · 191 cm",
    "Market value €400k (2025-06-03)",
    "Top speed 30.9 km/h · faster than 94% of other A-League centre-backs",
    "Time to sprint 1.3 s",
    "Out of possession 12.4 m/min at high intensity · more than 54% of other centre-backs",
    "1.2 off-ball runs per 30 min in possession (0.2 in behind)",
    "88% passes completed · 2.5 line-breaking per 30 min",
    "No international caps",
    "SkillCorner (A-League Men 2024/25) · Transfermarkt",
  ]);
});

test("missing or older data is said plainly", () => {
  const lines = text(scoutingCardLines(player({ clubNow: null, transfermarkt: null,
    measured: { ...player().scouting.measured, timeToSprintS: null },
    national: { caps: 7, goals: 0, team: null, citizenship: "Australia" } })));
  assert.ok(lines.includes("Auckland FC"));
  assert.ok(lines.includes("Age 26 · Central Defender · no Transfermarkt record"));
  assert.ok(lines.includes("No 2024/25 valuation"));
  assert.ok(lines.includes("Time to sprint: position median (not measured)"));
  assert.ok(lines.includes("7 international caps (may include youth caps) · citizenship Australia"));
  const older = text(scoutingCardLines(player({ transfermarkt: { ...player().scouting.transfermarkt,
    marketValue: { eur: 600000, date: "2023-05-31", club: "AEK Larnaca", older: true } },
    national: { caps: 61, goals: 4, team: "Australia", citizenship: "Australia" } })));
  assert.ok(older.includes("No 2024/25 valuation · older value €600k (2023-05-31, AEK Larnaca)"));
  assert.ok(older.includes("61 caps, 4 goals for Australia"));
});

test("money is shown in thousands or millions, and players without scouting data get no card", () => {
  assert.equal(formatEuros(1250000), "€1.3m");
  assert.equal(formatEuros(450000), "€450k");
  assert.deepEqual(scoutingCardLines({ id: "Player2", displayName: "Home 2" }), []);
});
