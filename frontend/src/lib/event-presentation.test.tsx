import { describe, expect, it } from "vitest";
import { eventDataset } from "./event-presentation";
import type { EventMatch, EventPlayer, EventMomentum, MatchEvent } from "./backend/ghostxi";

// Small source-shaped fixture: deliberately unknown shirt number and playing time.
const match = {
  id: "statsbomb:3943043",
  providerId: 3943043,
  name: "Spain vs England",
  date: "2024-07-14",
  competition: "UEFA Euro",
  season: "2024",
  stadium: "Olympiastadion Berlin",
  home: { id: 772, name: "Spain", score: 2 },
  away: { id: 768, name: "England", score: 1 },
  statsMethod: "Recorded event counts",
  keyMoments: [
    {
      eventId: "bf03dfcf-f281-4646-98de-620649a1308b",
      minute: 46,
      second: 9,
      elapsedSeconds: 2892.681,
      teamName: "Spain",
      playerName: "Nico Williams",
      outcome: "Goal",
      type: "Shot",
      xg: 0.1124816,
    },
  ],
} as EventMatch;
const roster = [
  {
    id: "statsbomb:68574",
    providerId: 68574,
    fullName: "Nicholas Williams Arthuer",
    name: "Nico Williams",
    sample: "one match",
    dataKind: "OBSERVED / DERIVED",
    marketLink: { status: "unlinked", profile: null },
    source: {
      id: "statsbomb",
      name: "StatsBomb Open Data",
      url: "https://github.com/hudl/open-data",
      ready: true,
      limitations: [],
    },
    teamName: "Spain",
    teamId: 772,
    jerseyNumber: null,
    minutesPlayed: null,
    starter: true,
    positions: ["Left Wing"],
    country: "Spain",
    stats: { goals: 1, assists: 0, shots: 3, passesCompleted: 41 },
    per90: {},
  },
] as EventPlayer[];
const momentum = {
  totals: { homeXG: 1.7917, awayXG: 0.7264 },
  method: "Trailing five xG bins",
  points: [{ elapsedSeconds: 2892.681, value: 0.5 }],
} as EventMomentum;
const events = [
  { id: "bf03dfcf-f281-4646-98de-620649a1308b", type: "Shot", phase: "match" },
  { id: "pass", type: "Pass" },
] as MatchEvent[];

describe("named match presentation", () => {
  it("keeps source identity, full-time score, real player names and selected-match statistics together", () => {
    const d = eventDataset(match, roster, momentum, events, "Spain");
    expect(d.match).toMatchObject({
      id: match.id,
      date: "2024-07-14",
      home: { name: "Spain", score: 2 },
      away: { name: "England", score: 1 },
    });
    expect(d.candidates[0]?.name).toBe("Nico Williams");
    expect(d.scoutProfiles["statsbomb:68574"]?.assists).toBe(0);
    expect(d.moments[0]).toMatchObject({
      backendId: "bf03dfcf-f281-4646-98de-620649a1308b",
      minute: 46.15,
      elapsedMinute: 2892.681 / 60,
    });
    expect(d.scoreboardStats[0]).toEqual(["Home xG", "1.79"]);
  });
  it("preserves missing metadata and never synthesizes tracking, ghost results or scouting ratings from events", () => {
    const d = eventDataset(match, roster, momentum, events, "Spain");
    expect(d.scoutProfiles["statsbomb:68574"]?.minutes).toBeNull();
    expect(d.candidates[0]?.fit).toBeNull();
    expect(d.candidates[0]?.radar).toEqual([]);
    expect(d.fieldPlayers.every((p) => p.frames.length === 0)).toBe(true);
    expect(d.ballFrames).toEqual({ original: [], ghost: [] });
    expect(d.momentumSeries[0]?.ghost).toBeNull();
    expect(d.comparison).toEqual([]);
    expect(d.scenarios).toEqual([]);
  });
});
