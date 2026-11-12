import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const data = JSON.parse(await readFile(new URL("../src/data/scouting-candidates.json", import.meta.url), "utf8"));
const licence = await readFile(new URL("../src/data/skillcorner/LICENSE", import.meta.url), "utf8");
const scenarioIds = ["home-wide-interception", "home-defensive-press", "home-deep-pass-attack"];
const byId = new Map(data.candidates.map((candidate) => [candidate.id, candidate]));

test("three shortlists of four different real candidates, one per kind of pick", () => {
  assert.deepEqual(Object.keys(data.shortlists).sort(), [...scenarioIds].sort());
  const all = scenarioIds.flatMap((id) => data.shortlists[id]);
  assert.equal(new Set(all).size, 12);
  for (const id of scenarioIds) {
    assert.ok(data.shortlists[id].every((candidateId) => byId.has(candidateId)), id);
    assert.deepEqual(data.shortlists[id].map((candidateId) => byId.get(candidateId).pick).sort(),
      ["acceleration", "fastest", "hiddenTalent", "outOfPossession"], id);
  }
});

test("settings stay inside the ranges the spec allows", () => {
  for (const { id, settings, filled } of data.candidates) {
    assert.ok(settings.topSpeed >= 6.7 && settings.topSpeed <= 9, `${id} topSpeed ${settings.topSpeed}`);
    assert.ok(settings.acceleration >= 4 && settings.acceleration <= 6, `${id} acceleration ${settings.acceleration}`);
    assert.ok(settings.reaction >= 0.16 && settings.reaction <= 0.48, `${id} reaction ${settings.reaction}`);
    assert.ok(settings.engageRange >= 3 && settings.engageRange <= 9, `${id} engageRange ${settings.engageRange}`);
    assert.ok(filled.every((name) => ["timeToSprint", "outOfPossession"].includes(name)), `${id} filled ${filled}`);
  }
});

test("every hidden talent has a current 2024/25 market value", () => {
  for (const candidate of data.candidates.filter(({ pick }) => pick === "hiddenTalent")) {
    assert.equal(candidate.transfermarkt?.marketValue?.older, false, candidate.id);
  }
});

test("the sources and SkillCorner's licence ship with the data", () => {
  const names = data.sources.map(({ name }) => name);
  assert.ok(names.includes("SkillCorner Open Data") && names.includes("Transfermarkt datasets"));
  assert.match(licence, /MIT/);
});
