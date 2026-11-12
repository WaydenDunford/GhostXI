import { describe, expect, it } from "vitest";
import { eventDataset } from "./event-presentation";
import type { EventMatch, EventPlayer, EventMomentum, MatchEvent } from "./backend/ghostxi";

// Small source-shaped fixture: deliberately unknown shirt number and playing time.
const match = {
  id: "statsbomb:3749257",
  providerId: 3749257,
  name: "Arsenal vs Leicester City",
  date: "2004-05-15",
  competition: "Premier League",
  season: "2003/2004",
  stadium: "Arsenal Stadium",
  home: { id: 1, name: "Arsenal", score: 2 },
  away: { id: 31, name: "Leicester City", score: 1 },
  statsMethod: "Recorded event counts",
  keyMoments: [
    {
      eventId: "henry-goal",
      minute: 46,
      second: 45,
      elapsedSeconds: 2900,
      teamName: "Arsenal",
      playerName: "Thierry Henry",
      outcome: "Goal",
      type: "Shot",
      xg: 0.783,
    },
  ],
} as EventMatch;
const roster = [
  {
    id: "statsbomb:henry",
    providerId: 123,
    fullName: "Thierry Henry",
    name: "Thierry Henry",
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
    teamName: "Arsenal",
    teamId: 1,
    jerseyNumber: null,
    minutesPlayed: null,
    starter: true,
    positions: ["Left Center Forward"],
    country: "France",
    stats: { goals: 1, assists: 0, shots: 5, passesCompleted: 20 },
    per90: {},
  },
] as EventPlayer[];
const momentum = {
  totals: { homeXG: 2.54, awayXG: 0.11 },
  method: "Trailing five xG bins",
  points: [{ elapsedSeconds: 2900, value: 0.5 }],
} as EventMomentum;
const events = [
  { id: "henry-goal", type: "Shot", phase: "match" },
  { id: "pass", type: "Pass" },
] as MatchEvent[];

describe("named match presentation", () => {
  it("keeps source identity, full-time score, real player names and selected-match statistics together", () => {
    const d = eventDataset(match, roster, momentum, events, "Arsenal");
    expect(d.match).toMatchObject({
      id: match.id,
      date: "2004-05-15",
      home: { name: "Arsenal", score: 2 },
      away: { name: "Leicester City", score: 1 },
    });
    expect(d.candidates[0]?.name).toBe("Thierry Henry");
    expect(d.scoutProfiles["statsbomb:henry"]?.assists).toBe(0);
    expect(d.moments[0]).toMatchObject({
      backendId: "henry-goal",
      minute: 46.75,
      elapsedMinute: 2900 / 60,
    });
    expect(d.scoreboardStats[0]).toEqual(["Home xG", "2.54"]);
  });
  it("preserves missing metadata and never synthesizes tracking, ghost results or scouting ratings from events", () => {
    const d = eventDataset(match, roster, momentum, events, "Arsenal");
    expect(d.scoutProfiles["statsbomb:henry"]?.minutes).toBeNull();
    expect(d.candidates[0]?.fit).toBeNull();
    expect(d.candidates[0]?.radar).toEqual([]);
    expect(d.fieldPlayers.every((p) => p.frames.length === 0)).toBe(true);
    expect(d.ballFrames).toEqual({ original: [], ghost: [] });
    expect(d.momentumSeries[0]?.ghost).toBeNull();
    expect(d.comparison).toEqual([]);
    expect(d.scenarios).toEqual([]);
  });
});
