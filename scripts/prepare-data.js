import { rename, rm, writeFile } from "node:fs/promises";
import { attackingDirection, fetchEvents, fetchTrackingWindow } from "@pitchkit/data-providers/metrica";
import { replacementProfiles } from "../src/simulation/alternative.js";

const revision = "e706dd506b360d69d9d123d5b8026e7294b13996";
const baseUrl = `https://raw.githubusercontent.com/metrica-sports/sample-data/${revision}/data`;
const pitch = { length: 105, width: 68 };
const fps = 25;
const scenarios = [
  {
    id: "home-wide-interception", title: "Home intercepts a wide pass", context: "transition",
    firstFrame: 251, lastFrame: 451,
    start: { frame: 346, team: "Away", type: "BALL LOST", subtype: "INTERCEPTION" },
    end: { frame: 378, team: "Home", type: "RECOVERY", subtype: "INTERCEPTION" },
    description: "Away plays infield from the touchline. Home 2 makes the recorded interception at 00:15.12.",
    phases: ["Away has possession near the touchline.", "Away's pass is in flight.", "Home 2 intercepted the pass at 00:15.12."],
    anchor: { x: 29, y: 54.5 },
    candidatePlayerIds: ["lane-reader", "patient-cover"],
  },
  {
    id: "home-defensive-press", title: "Home presses and wins a tackle", context: "press",
    firstFrame: 5530, lastFrame: 5730,
    start: { frame: 5549, team: "Away", type: "RECOVERY", subtype: "INTERCEPTION" },
    end: { frame: 5627, team: "Home", type: "CHALLENGE", subtype: "TACKLE-WON" },
    description: "Away recovers the ball in Home's half. Home 1 closes down and wins the recorded tackle at 03:45.08.",
    phases: ["Play builds toward the defensive duel.", "Away has recovered the ball. Home closes down.", "Home 1 won the tackle at 03:45.08."],
    anchor: { x: 23, y: 42 },
    candidatePlayerIds: ["patient-cover", "lane-reader"],
  },
  {
    id: "home-deep-pass-attack", title: "Home turns a deep pass into a shot", context: "attack",
    firstFrame: 9432, lastFrame: 9632,
    start: { frame: 9599, team: "Home", type: "PASS", subtype: "DEEP BALL" },
    end: { frame: 9628, team: "Home", type: "SHOT" },
    description: "Home 10 plays a deep pass to Home 8, who takes the recorded shot at 06:25.12.",
    phases: ["Home builds toward the deep pass.", "Home 10's pass to Home 8 is in flight.", "Home 8 took the shot at 06:25.12."],
    anchor: { x: 98, y: 25 }, ballLead: 6,
    candidatePlayerIds: ["wide-runner", "lane-reader"],
  },
];
const options = { baseUrl, signal: AbortSignal.timeout(90_000) };
const [events, ...windows] = await Promise.all([
  fetchEvents(1, options),
  ...scenarios.map(({ firstFrame, lastFrame }) => fetchTrackingWindow(1, {
    ...options, fromFrame: firstFrame - 1, toFrame: lastFrame,
  })),
]);

const metres = ({ x, y }) => ({ x: Number((x * pitch.length).toFixed(5)), y: Number((y * pitch.width).toFixed(5)) });
const inBounds = (point) => point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
const players = windows[0][1]?.players ?? [];
const lineup = {
  home: players.filter(({ team }) => team === "Home").map(({ player }) => player),
  away: players.filter(({ team }) => team === "Away").map(({ player }) => player),
};
const teamsById = new Map(players.map(({ player, team }) => [player, team]));
if (lineup.home.length !== 11 || lineup.away.length !== 11 || teamsById.size !== 22) {
  throw new Error("Expected distinct recorded lineups of 11 players per team.");
}
const candidateIds = new Set(replacementProfiles.map(({ id }) => id));
if (candidateIds.size !== replacementProfiles.length || replacementProfiles.some(({ id, team, traits }) =>
  teamsById.has(id) || team !== "HOME" || ["pace", "positioning", "defending", "passing", "stamina"].some((name) =>
    !Number.isFinite(traits[name]) || traits[name] < 0 || traits[name] > 100))) {
  throw new Error("Replacement profiles must have distinct IDs and all five trait scores between 0 and 100.");
}
const homeDirection = attackingDirection(windows[0][1], "Home");
if (!homeDirection) throw new Error("Unable to determine Home's first-half attacking direction.");

function findEvent({ frame, team, type, subtype }) {
  return events.find((event) => event["Start Frame"] === frame && event.Team === team
    && event.Type === type && (!subtype || event.Subtype === subtype));
}

function clock(seconds) {
  const hundredths = Math.round(seconds * 100);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, "0")}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, "0")}`;
}

function prepareMoment(scenario, rawFrames) {
  const { id, title, description, context, firstFrame, lastFrame, start, end, phases, anchor, ballLead, candidatePlayerIds } = scenario;
  if (!candidatePlayerIds.length || new Set(candidatePlayerIds).size !== candidatePlayerIds.length
    || !candidatePlayerIds.every((candidateId) => candidateIds.has(candidateId))) {
    throw new Error(`${id}: expected distinct replacement profiles from the modeled squad.`);
  }
  const [previous, ...clip] = rawFrames;
  const startTime = clip[0]?.["Time [s]"];
  const valid = previous?.Frame === firstFrame - 1 && clip.length === lastFrame - firstFrame + 1
    && clip.every((frame, index) => frame.Frame === firstFrame + index && frame.Period === 1
      && Math.abs(frame["Time [s]"] - startTime - index / fps) < 0.001 && inBounds(frame.ball)
      && frame.players.length === 22 && new Set(frame.players.map(({ player }) => player)).size === 22
      && frame.players.every((player) => teamsById.get(player.player) === player.team && inBounds(player)));
  if (!valid) throw new Error(`${id}: expected continuous in-bounds tracking for the ball and all 22 starters.`);

  const firstAction = findEvent(start);
  const lastAction = findEvent(end);
  const targetPlayerId = lastAction?.From;
  if (!firstAction || teamsById.get(targetPlayerId) !== "Home"
    || start.frame < firstFrame || end.frame <= start.frame || end.frame > lastFrame
    || (context === "attack" && firstAction.To !== targetPlayerId)) {
    throw new Error(`${id}: the expected event sequence or target player is missing.`);
  }
  const priorPlayer = previous.players.find((player) => player.player === targetPlayerId);
  const priorInterval = startTime - previous["Time [s]"];
  if (!inBounds(priorPlayer) || Math.abs(priorInterval - 1 / fps) >= 0.001) {
    throw new Error(`${id}: the target player has no valid pre-clip tracking sample.`);
  }

  const frames = clip.map((frame) => ({
    sourceFrame: frame.Frame,
    time: Number((frame["Time [s]"] - startTime).toFixed(2)),
    ball: metres(frame.ball),
    players: Object.fromEntries(frame.players.map((player) => [player.player, metres(player)])),
  }));
  const initial = frames[0].players[targetPlayerId];
  const prior = metres(priorPlayer);
  return {
    id, title, description, context, targetPlayerId, candidatePlayerIds, startTime, startClock: clock(startTime),
    durationSec: frames.at(-1).time, frames, anchor, ballLead,
    initialVelocity: { x: (initial.x - prior.x) / priorInterval, y: (initial.y - prior.y) / priorInterval },
    action: { startFrame: start.frame, endFrame: end.frame, team: start.team.toUpperCase(), phases },
  };
}

const recorded = {
  id: "metrica-game-1",
  name: "Metrica Sample Game 1 · Home vs Away",
  dataKind: "tracking",
  source: { name: "Metrica Sports Sample Data", url: "https://github.com/metrica-sports/sample-data", revision },
  pitch,
  fps,
  homeAttacksRightFirstHalf: homeDirection === "left_to_right",
  players: players.map(({ player, jersey, team }) => ({
    id: player, displayName: `${team} ${jersey ?? player}`, team: team.toUpperCase(),
  })),
  lineup,
  moments: scenarios.map((scenario, index) => prepareMoment(scenario, windows[index])),
  matchEndSeconds: Math.max(...events.map((event) => event["Start Time [s]"])),
  events: events.filter((event) => (event.Type === "PASS" || event.Type === "SHOT") && event.x !== undefined)
    .map((event) => ({
      team: event.Team.toUpperCase(),
      period: event.Period,
      time: event["Start Time [s]"],
      // Value completed passes at the receiving location and shots at the release location.
      location: metres(event.Type === "PASS" && event.endX !== undefined ? { x: event.endX, y: event.endY } : event),
    })),
};

const destination = new URL("../src/data/metrica-game1.json", import.meta.url);
const temporary = new URL(`../src/data/metrica-game1.${process.pid}.tmp`, import.meta.url);
try {
  await writeFile(temporary, `${JSON.stringify(recorded)}\n`);
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
console.log(`Prepared ${recorded.moments.length} recorded clips and ${recorded.events.length} pass/shot locations from ${recorded.source.name}.`);
