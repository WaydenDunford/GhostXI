import { rename, rm, writeFile } from "node:fs/promises";
import { attackingDirection, fetchEvents, fetchTrackingWindow, hasSubtype } from "@pitchkit/data-providers/metrica";

const revision = "e706dd506b360d69d9d123d5b8026e7294b13996";
const baseUrl = `https://raw.githubusercontent.com/metrica-sports/sample-data/${revision}/data`;
const pitch = { length: 105, width: 68 };
const firstFrame = 251;
const lastFrame = 451;
const options = { baseUrl, signal: AbortSignal.timeout(90_000) };
const [events, rawFrames] = await Promise.all([
  fetchEvents(1, options),
  fetchTrackingWindow(1, { ...options, fromFrame: firstFrame - 1, toFrame: lastFrame }),
]);

const loss = events.find((event) => event["Start Frame"] === 346 && event.Team === "Away"
  && event.Type === "BALL LOST" && hasSubtype(event, "INTERCEPTION"));
const recovery = events.find((event) => event["Start Frame"] === 378 && event.Team === "Home"
  && event.Type === "RECOVERY" && hasSubtype(event, "INTERCEPTION"));
if (!loss || !recovery?.From) throw new Error("The expected interception is missing from the source events.");

const [previous, ...clip] = rawFrames;
const startTime = clip[0]?.["Time [s]"];
const ids = new Set(clip[0]?.players.map((player) => player.player));
if (ids.size !== 22 || clip.length !== lastFrame - firstFrame + 1 || !clip.every((frame, index) =>
  frame.Frame === firstFrame + index && frame.Period === 1 && frame.ball && frame.players.length === 22
  && frame.players.every((player) => ids.has(player.player)))) {
  throw new Error("The recorded clip must have a continuous ball trace and a stable 22-player lineup.");
}

const metres = ({ x, y }) => ({ x: Number((x * pitch.length).toFixed(5)), y: Number((y * pitch.width).toFixed(5)) });
const frames = clip.map((frame) => ({
  sourceFrame: frame.Frame,
  time: Number((frame["Time [s]"] - startTime).toFixed(2)),
  ball: metres(frame.ball),
  players: Object.fromEntries(frame.players.map((player) => [player.player, metres(player)])),
}));
const priorPlayer = previous.players.find((player) => player.player === recovery.From);
if (!priorPlayer) throw new Error("The outgoing player has no pre-clip tracking sample.");
const initial = frames[0].players[recovery.From];
const prior = metres(priorPlayer);
const priorInterval = startTime - previous["Time [s]"];
const homeDirection = attackingDirection(clip[0], "Home");
if (!homeDirection) throw new Error("Unable to determine Home's first-half attacking direction.");

const recorded = {
  id: "metrica-game-1",
  name: "Metrica Sample Game 1 · Home vs Away",
  dataKind: "tracking",
  source: { name: "Metrica Sports Sample Data", url: "https://github.com/metrica-sports/sample-data", revision },
  pitch,
  fps: 25,
  homeAttacksRightFirstHalf: homeDirection === "left_to_right",
  players: clip[0].players.map(({ player, jersey, team }) => ({
    id: player, displayName: `${team} ${jersey ?? player}`, team: team.toUpperCase(),
  })),
  moments: [{
    id: "home-wide-interception",
    title: "Home intercepts a wide pass",
    description: "Away plays infield from the touchline. Home 2 makes the recorded interception at 00:15.12.",
    startClock: "00:10.04",
    startTime,
    durationSec: frames.at(-1).time,
    context: "transition",
    targetPlayerId: recovery.From,
    initialVelocity: { x: (initial.x - prior.x) / priorInterval, y: (initial.y - prior.y) / priorInterval },
    interception: { releaseFrame: loss["Start Frame"], recoveryFrame: recovery["Start Frame"] },
    frames,
  }],
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
console.log(`Prepared ${frames.length} recorded frames and ${recorded.events.length} pass/shot locations from ${recorded.source.name}.`);
