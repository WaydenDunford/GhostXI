import assert from "node:assert/strict";
import { test } from "node:test";
import { arriveVelocity, interceptionTarget, timeToReach } from "../src/simulation/movement.js";
import { simulateAlternative } from "../src/simulation/alternative.js";

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const pitch = { length: 105, width: 68 };

test("timeToReach accelerates, then cruises", () => {
  close(timeToReach(2.5, 0, 5, 8), 1); // ½·5·1² = 2.5 m
  close(timeToReach(10, 0, 5, 8), 2.05); // 1.6 s to reach 8 m/s covers 6.4 m, then 3.6 m at 8 m/s
  close(timeToReach(10, 8, 5, 8), 1.25);
  close(timeToReach(0, 0, 5, 8), 0);
});

test("arriveVelocity respects acceleration, top speed and braking", () => {
  const settings = { topSpeed: 8, acceleration: 5 };
  close(arriveVelocity({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }, settings, 0.04).x, 0.2);
  close(arriveVelocity({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 100, y: 0 }, settings, 0.04).x, 8);
  close(arriveVelocity({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 1, y: 0 }, settings, 0.04).x, 7.8);
});

test("a quicker player meets the ball earlier; a narrow engage range holds", () => {
  const base = { position: { x: 12, y: 3 }, velocity: { x: 0, y: 0 }, ball: { x: 0, y: 0 }, previousBall: { x: -0.4, y: 0 },
    dt: 0.04, tacticalPoint: { x: 12, y: 3 }, pitch };
  const fast = interceptionTarget({ ...base, settings: { topSpeed: 9, acceleration: 6, engageRange: 6 } });
  const slow = interceptionTarget({ ...base, settings: { topSpeed: 7, acceleration: 4, engageRange: 6 } });
  close(fast.x, 10.8, 1e-6);
  close(fast.y, 0);
  close(slow.x, 12.4, 1e-6);
  assert.equal(interceptionTarget({ ...base, settings: { topSpeed: 9, acceleration: 6, engageRange: 1 } }), null);
});

test("a still ball is met where it lies; a path leaving the pitch is not chased", () => {
  const settings = { topSpeed: 9, acceleration: 6, engageRange: 6 };
  assert.deepEqual(interceptionTarget({ position: { x: 8, y: 3 }, velocity: { x: 0, y: 0 }, ball: { x: 10, y: 3 },
    previousBall: { x: 10, y: 3 }, dt: 0.04, tacticalPoint: { x: 8, y: 3 }, pitch, settings }), { x: 10, y: 3 });
  assert.equal(interceptionTarget({ position: { x: 90, y: 34 }, velocity: { x: 0, y: 0 }, ball: { x: 104, y: 34 },
    previousBall: { x: 103.6, y: 34 }, dt: 0.04, tacticalPoint: { x: 90, y: 34 }, pitch,
    settings: { ...settings, engageRange: 9 } }), null);
});

function syntheticMatch() {
  const frames = Array.from({ length: 76 }, (_, index) => {
    const time = index * 0.04;
    return { time, sourceFrame: 1000 + index, ball: { x: 10 * time, y: 30 }, players: { P: { x: 14, y: 34 } } };
  });
  const candidate = (id, settings) => ({ id, displayName: id, team: "HOME", age: 25, settings, scouting: { name: id } });
  return {
    pitch,
    players: [{ id: "P", displayName: "P", team: "HOME" },
      candidate("fast", { topSpeed: 9, acceleration: 6, reaction: 0.16, engageRange: 9 }),
      candidate("slow", { topSpeed: 7, acceleration: 4, reaction: 0.48, engageRange: 3 })],
    moments: [{ id: "m", frames, targetPlayerId: "P", initialVelocity: { x: 0, y: 0 },
      action: { startFrame: 1000, endFrame: 1075 }, anchor: { x: 14, y: 34 }, candidatePlayerIds: ["fast", "slow"] }],
  };
}

test("simulateAlternative goes for a reachable ball only when the settings allow it", () => {
  const match = syntheticMatch();
  const run = (candidateId) => simulateAlternative({ match, momentId: "m", candidateId });
  const closest = ({ alternativeFrames }, id) => Math.min(...alternativeFrames.map(({ players, ball }) =>
    Math.hypot(players[id].x - ball.x, players[id].y - ball.y)));
  const [fast, slow] = [run("fast"), run("slow")];
  assert.ok(fast.engagedFrames.some(Boolean), "the quick candidate goes for the ball");
  assert.ok(slow.engagedFrames.every((engaged) => !engaged), "the ball never enters the slow candidate's 3 m range");
  assert.ok(closest(fast, "fast") < closest(slow, "slow"));
  assert.deepEqual(run("fast"), fast);
  assert.throws(() => run("P"), /shortlist/);
});
