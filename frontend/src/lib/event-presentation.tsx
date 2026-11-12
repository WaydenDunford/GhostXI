import type { ReactNode } from "react";
import type { EventMatch, EventPlayer, EventMomentum, MatchEvent } from "./backend/ghostxi";
import type { SportDataset } from "./sport-data";
import type { Player, ScoutProfile } from "./mock-data";
import { useBackend } from "./backend-context";
import { PresentationContext } from "./sport-context";
import { Button } from "@/components/ui/button";

export function eventDataset(
  match: EventMatch,
  roster: EventPlayer[],
  momentum: EventMomentum,
  events: MatchEvent[],
  teamName: string,
): SportDataset {
  const profiles: Record<string, ScoutProfile> = {};
  const ordered = [...roster].sort(
    (a, b) =>
      Number(b.teamName === teamName) - Number(a.teamName === teamName) ||
      (b.stats["shots"] ?? 0) - (a.stats["shots"] ?? 0),
  );
  const players: Player[] = ordered.map((p) => {
    profiles[p.id] = {
      height: "Unavailable",
      value: "Unavailable",
      contract: "Unavailable",
      apps: p.minutesPlayed ? 1 : 0,
      minutes: p.minutesPlayed,
      goals: p.stats["goals"] ?? null,
      assists: p.stats["assists"] ?? null,
      league: `${match.competition} · ${match.season} · one match`,
      similar: [],
      scout: match.statsMethod,
      form: [],
      tags: ["StatsBomb", "Match roster", p.starter ? "Starting XI" : "Bench"],
      heat: [],
    };
    return {
      id: p.id,
      name: p.name,
      age: null,
      position: p.positions[0] ?? "Unavailable",
      foot: "Unavailable",
      team: p.teamName,
      nationality: p.country ?? "Unavailable",
      style: "Observed match actions",
      coverage: 1,
      fit: null,
      verdict: "Not assessed",
      summary: `${p.stats["passesCompleted"] ?? 0} completed passes · ${p.stats["shots"] ?? 0} shots · ${p.stats["goals"] ?? 0} goals in this match.`,
      styleSummary: "Match event counts; physical traits and team fit have not been assessed.",
      strengths: [],
      weaknesses: [],
      roles: [],
      radar: [],
      stats: ["passesCompleted", "shots", "goals", "assists", "pressures", "recoveries"].map(
        (k) => ({
          label: k.replace(/([A-Z])/g, " $1"),
          value: p.stats[k] ?? 0,
          per90: p.per90[k]?.toFixed(2) ?? "—",
        }),
      ),
      why: "Recorded match roster and actions, not a replacement recommendation.",
    };
  });
  const moments = match.keyMoments.map((m, i) => ({
    id: i + 1,
    backendId: m.eventId,
    elapsedMinute: m.elapsedSeconds / 60,
    minute: m.minute + m.second / 60,
    title: `${m.outcome ?? m.type} · ${m.playerName ?? m.teamName}`,
    team: m.teamName === match.home.name ? ("home" as const) : ("away" as const),
    type: m.type,
    impact: (m.xg ?? 0) * 100,
    impactLabel: m.xg === null ? "—" : `xG ${m.xg.toFixed(3)}`,
    kind: "observed" as const,
    description: `${m.teamName} · ${m.minute}:${String(m.second).padStart(2, "0")} · ${m.outcome ?? m.type}${m.xg !== null ? ` · xG ${m.xg.toFixed(3)}` : ""}`,
  }));
  const shots = events.filter((e) => e.type === "Shot" && e.phase === "match");
  const passes = events.filter((e) => e.type === "Pass");
  const home = (t: EventMatch["home"]) => ({
    name: t.name,
    short: t.name === "Arsenal" ? "ARS" : t.name.slice(0, 3).toUpperCase(),
    score: t.score,
    formation: "See recorded lineup",
  });
  return {
    id: "football",
    demo: false,
    momentumMethod: momentum.method,
    match: {
      id: match.id,
      competition: `${match.competition} · ${match.season}`,
      date: match.date,
      venue: match.stadium ?? "Venue unavailable",
      attendance: "Unavailable",
      home: home(match.home),
      away: home(match.away),
      coverage: 1,
    },
    moments,
    momentumSeries: momentum.points.map((p) => ({
      minute: p.elapsedSeconds / 60,
      momentum: p.value * 100,
      ghost: null,
    })),
    candidates: players,
    scoutProfiles: profiles,
    scenarios: [],
    fieldPlayers: roster.map((p) => ({
      id: p.id,
      num: p.jerseyNumber ?? 0,
      label: p.name,
      team: p.teamId === match.home.id ? "home" : "away",
      frames: [],
    })),
    ballFrames: { original: [], ghost: [] },
    comparison: [],
    coachInsights: [],
    coachDetails: {},
    dashboardKpis: [
      ["Match date", match.date],
      ["Recorded events", String(events.length)],
      ["Shots", String(shots.length)],
      ["Lineup players", String(roster.length)],
    ],
    scoreboardStats: [
      ["Home xG", momentum.totals.homeXG.toFixed(2)],
      ["Away xG", momentum.totals.awayXG.toFixed(2)],
      ["Shots", String(shots.length)],
      ["Passes", String(passes.length)],
    ],
    momentumKpis: [
      {
        label: `${match.home.name} xG`,
        value: momentum.totals.homeXG.toFixed(2),
        sub: "Sum of recorded shot xG",
        tone: "text-primary",
      },
      {
        label: `${match.away.name} xG`,
        value: momentum.totals.awayXG.toFixed(2),
        sub: "Sum of recorded shot xG",
        tone: "text-accent",
      },
      {
        label: "Shots",
        value: String(shots.length),
        sub: "Shootouts excluded",
        tone: "text-success",
      },
      {
        label: "Passes",
        value: String(passes.length),
        sub: "Recorded attempts",
        tone: "text-warning",
      },
    ],
    eventBreakdown: ["Pass", "Carry", "Shot", "Pressure", "Ball Recovery"].map((type) => ({
      label: type,
      value: (events.filter((e) => e.type === type).length / Math.max(events.length, 1)) * 100,
      hint: String(events.filter((e) => e.type === type).length),
    })),
    phases: ["Recorded event", "Recorded event", "Recorded event"],
    coach: {
      tag: `${match.name} · ${match.date}`,
      body: `Final score ${match.home.score}–${match.away.score}. ${shots.length} recorded shots; xG ${momentum.totals.homeXG.toFixed(2)}–${momentum.totals.awayXG.toFixed(2)}.`,
      observations: [match.statsMethod, momentum.method],
      original: "Positions show the recorded actor and action endpoints in attacking coordinates.",
      ghost:
        "This match has event data only. Choose Tracking replays to run a ghost scenario on available movement data.",
      wrong: "Events alone cannot establish off-ball positioning or individual defensive errors.",
      improved: "Select a recorded shot or pass in Match Lab to inspect its source details.",
      next: ["Review recorded shots", "Compare completed passes and recoveries"],
      testNext: moments.map((m) => ({ label: m.title, momentId: m.id })),
    },
  };
}

export function EventFootballPresentation({ children }: { children: ReactNode }) {
  const b = useBackend();
  const queries = [b.eventCatalog, b.eventMatch, b.eventPlayers, b.eventMomentum, b.eventActions];
  const error = queries.find((q) => q.error)?.error;
  if (error || (b.eventCatalog.isSuccess && !b.eventMatches.length))
    return (
      <div className="m-8 space-y-3 text-foreground">
        <p role="alert">
          {error?.message ?? "No real event matches imported. Run npm run prepare:external."}
        </p>
        <Button onClick={() => queries.forEach((q) => void q.refetch())}>
          Retry data connection
        </Button>
        <Button variant="outline" onClick={() => b.setSourceMode("tracking")}>
          Open tracking replays
        </Button>
      </div>
    );
  if (!b.eventMatch.data || !b.eventPlayers.data || !b.eventMomentum.data || !b.eventActions.data)
    return (
      <p role="status" className="p-8 font-mono text-sm text-muted-foreground">
        Loading verified match events and lineups…
      </p>
    );
  const dataset = eventDataset(
    b.eventMatch.data,
    b.eventPlayers.data,
    b.eventMomentum.data,
    b.eventActions.data,
    b.teamName,
  );
  return <PresentationContext.Provider value={dataset}>{children}</PresentationContext.Provider>;
}
