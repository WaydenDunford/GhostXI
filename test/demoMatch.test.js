// Acceptance tests for Prompt B: src/data/demoMatch.js (synthetic demo data). Run with npm test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { getDemoMatch, validateMatch } from "../src/data/demoMatch.js";

const CONTEXTS = ["press", "transition", "attack"];
const TRAITS = ["defending", "pace", "passing", "positioning", "stamina"];
const STEP = 0.5;
const MAX_PLAYER_STEP = 4.5; // m per 0.5 s = 9 m/s (Metrica sample peak is 8.8 m/s)
const MAX_BALL_STEP = 16; // m per 0.5 s = 32 m/s

const match = getDemoMatch();
const players = new Map((match.players ?? []).map((player) => [player.id, player]));
const starters = [...(match.lineup?.home ?? []), ...(match.lineup?.away ?? [])];
const onPitch = new Set(starters);
const reserves = (match.players ?? []).filter((player) => !onPitch.has(player.id));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const momentFor = (context) => {
  const moment = match.moments?.find((candidate) => candidate.context === context);
  assert.ok(moment, `there is no ${context} moment`);
  return moment;
};

test("returns a synthetic match on the 105 × 68 m pitch", () => {
  assert.equal(typeof match.id, "string");
  assert.equal(typeof match.name, "string");
  assert.equal(match.dataKind, "synthetic");
  assert.deepEqual(match.pitch, { length: 105, width: 68 });
});

test("every call returns identical data as an independent copy", () => {
  const pristine = structuredClone(match);
  const copy = getDemoMatch();
  assert.deepEqual(copy, pristine);
  copy.moments[0].frames[0].players[copy.lineup.home[0]].x = 1;
  copy.players[0].traits.pace = 0;
  assert.deepEqual(getDemoMatch(), pristine);
});

test("each lineup has 11 players of its own team including exactly one goalkeeper", () => {
  for (const [side, team] of [["home", "HOME"], ["away", "AWAY"]]) {
    const ids = match.lineup?.[side] ?? [];
    assert.equal(ids.length, 11, `lineup.${side} size`);
    assert.equal(new Set(ids).size, 11, `lineup.${side} has duplicates`);
    for (const id of ids) assert.equal(players.get(id)?.team, team, `${id} should be ${team}`);
    assert.equal(ids.filter((id) => players.get(id).role === "GK").length, 1, `${side} goalkeepers`);
  }
});

test("players have unique ids, a known team and role, an integer age and 0–100 traits", () => {
  assert.equal(players.size, match.players.length, "duplicate player ids");
  for (const player of match.players) {
    assert.ok(player.displayName?.trim(), `${player.id} needs a displayName`);
    assert.ok(["HOME", "AWAY"].includes(player.team), `${player.id} team`);
    assert.ok(["GK", "DEF", "MID", "FWD"].includes(player.role), `${player.id} role`);
    assert.ok(Number.isInteger(player.age) && player.age >= 16 && player.age <= 40, `${player.id} age`);
    assert.deepEqual(Object.keys(player.traits).sort(), TRAITS, `${player.id} trait keys`);
    for (const trait of TRAITS) {
      const value = player.traits[trait];
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 100, `${player.id}.${trait} = ${value}`);
    }
  }
});

test("Home has three distinct reserve archetypes, two of them under 21", () => {
  assert.ok(reserves.length >= 3, `only ${reserves.length} reserves`);
  assert.ok(reserves.every((player) => player.team === "HOME"), "reserves must be HOME players");
  assert.ok(reserves.filter((player) => player.age < 21).length >= 2, "need two reserves under 21");
  const best = (trait) => reserves.reduce((a, b) => (b.traits[trait] > a.traits[trait] ? b : a));
  const [winger, fullBack, creative] = [best("pace"), best("defending"), best("passing")];
  assert.equal(new Set([winger.id, fullBack.id, creative.id]).size, 3, "archetypes must be different players");
  assert.equal(winger.role, "FWD", "fastest reserve should be a winger (FWD)");
  assert.equal(fullBack.role, "DEF", "best defender should be a full-back (DEF)");
  assert.equal(creative.role, "MID", "best passer should be a midfielder (MID)");
});

test("contains exactly one press, one transition and one attack scenario of 8–12 s", () => {
  assert.equal(match.moments?.length, 3);
  assert.deepEqual(match.moments.map(({ context }) => context).sort(), [...CONTEXTS].sort());
  assert.equal(new Set(match.moments.map(({ id }) => id)).size, 3, "moment ids must be unique");
  for (const moment of match.moments) {
    assert.ok(moment.title?.trim() && moment.description?.trim(), `${moment.id} needs title and description`);
    assert.match(moment.startClock, /^\d{1,3}:[0-5]\d$/);
    assert.ok(moment.durationSec >= 8 && moment.durationSec <= 12, `${moment.id} lasts ${moment.durationSec}s`);
  }
});

for (const context of CONTEXTS) {
  test(`${context}: the target is an active Home player and candidates are role-compatible Home reserves`, () => {
    const moment = momentFor(context);
    assert.ok(match.lineup.home.includes(moment.targetPlayerId), `target ${moment.targetPlayerId}`);
    assert.ok(moment.candidatePlayerIds.length >= 1, "no candidates");
    for (const id of moment.candidatePlayerIds) {
      assert.equal(players.get(id)?.team, "HOME", `${id} must be a HOME player`);
      assert.ok(!onPitch.has(id), `${id} must be a reserve`);
    }
    const targetRole = players.get(moment.targetPlayerId).role;
    assert.ok(moment.candidatePlayerIds.some((id) => players.get(id).role === targetRole),
      `no candidate shares the target's role ${targetRole}`);
  });

  test(`${context}: frames every 0.5 s track exactly the 22 starters and the ball inside the pitch`, () => {
    const { frames, durationSec } = momentFor(context);
    assert.equal(frames.length, durationSec / STEP + 1);
    frames.forEach((frame, index) => {
      assert.equal(frame.time, index * STEP);
      assert.deepEqual(Object.keys(frame.players).sort(), [...starters].sort(), `t=${frame.time}s player set`);
      for (const [id, point] of [...Object.entries(frame.players), ["ball", frame.ball]]) {
        assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= 105, `t=${frame.time}s ${id}.x = ${point.x}`);
        assert.ok(Number.isFinite(point.y) && point.y >= 0 && point.y <= 68, `t=${frame.time}s ${id}.y = ${point.y}`);
      }
    });
  });

  test(`${context}: nobody teleports between frames`, () => {
    const { frames } = momentFor(context);
    for (let index = 1; index < frames.length; index += 1) {
      const [before, after] = [frames[index - 1], frames[index]];
      for (const id of starters) {
        const step = distance(before.players[id], after.players[id]);
        assert.ok(step <= MAX_PLAYER_STEP, `${id} moves ${step.toFixed(2)} m before t=${after.time}s`);
      }
      const ballStep = distance(before.ball, after.ball);
      assert.ok(ballStep <= MAX_BALL_STEP, `ball moves ${ballStep.toFixed(2)} m before t=${after.time}s`);
    }
  });

  test(`${context}: whenever the ball is slow it is at a player's feet`, () => {
    const { frames } = momentFor(context);
    frames.forEach((frame, index) => {
      const neighbours = [frames[index - 1], frames[index + 1]].filter(Boolean);
      const slow = neighbours.every((other) => distance(other.ball, frame.ball) < 3.5); // < 7 m/s
      if (!slow) return;
      const nearest = Math.min(...Object.values(frame.players).map((point) => distance(point, frame.ball)));
      assert.ok(nearest <= 1.5, `t=${frame.time}s: slow ball is ${nearest.toFixed(2)} m from the nearest player`);
    });
  });

  test(`${context}: no outfield player drops behind their own goal-area line`, () => {
    for (const frame of momentFor(context).frames) {
      for (const [id, { x }] of Object.entries(frame.players)) {
        const { team, role } = players.get(id);
        if (role === "GK") continue;
        const fromOwnGoalLine = team === "HOME" ? x : 105 - x;
        assert.ok(fromOwnGoalLine >= 5.5, `${id} is ${fromOwnGoalLine.toFixed(2)} m from its own goal line at t=${frame.time}s`);
      }
    }
  });

  test(`${context}: the target player gets close to the ball`, () => {
    const { frames, targetPlayerId } = momentFor(context);
    const closest = Math.min(...frames.map((frame) => distance(frame.players[targetPlayerId], frame.ball)));
    assert.ok(closest <= 6, `${targetPlayerId} never gets within 6 m of the ball (closest ${closest.toFixed(2)} m)`);
  });
}

test("validateMatch accepts the demo match", () => {
  assert.doesNotThrow(() => validateMatch(getDemoMatch()));
});

const corruptions = [
  ["a duplicate player id", (m) => m.players.push({ ...m.players[3] }), /duplicate player id 'H4'/],
  ["a trait outside 0–100", (m) => { m.players[0].traits.pace = 140; }, /'H1'.*pace/],
  ["a frame missing a starter", (m) => { delete m.moments[0].frames[3].players.H7; }, /missing player 'H7'/],
  ["an out-of-bounds player", (m) => { m.moments[1].frames[2].players.A3.y = 70; }, /'A3' is out of bounds/],
  ["an out-of-bounds ball", (m) => { m.moments[2].frames[4].ball.x = 107; }, /ball is out of bounds/],
  ["a reserve tracked before substitution", (m) => { m.moments[0].frames[0].players["wide-runner"] = { x: 50, y: 30 }; },
    /'wide-runner'.*lineup/],
  ["a teleporting player", (m) => { m.moments[0].frames[6].players.H9.x -= 20; }, /'H9' jumps/],
  ["an unknown target", (m) => { m.moments[1].targetPlayerId = "nobody"; }, /target.*'nobody'/],
  ["an unknown candidate", (m) => { m.moments[2].candidatePlayerIds = ["ghost"]; }, /candidate 'ghost'/],
  ["a candidate who is already on the pitch", (m) => { m.moments[0].candidatePlayerIds = ["H2"]; },
    /candidate 'H2'.*already on the pitch/],
];

for (const [name, corrupt, message] of corruptions) {
  test(`validateMatch rejects ${name} with a clear error`, () => {
    const broken = structuredClone(getDemoMatch());
    corrupt(broken);
    assert.throws(() => validateMatch(broken), message);
  });
}
