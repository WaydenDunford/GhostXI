import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "./backend-context";
import { ghostxi } from "./ghostxi-api";
import { PresentationContext, useSport } from "./sport-context";
import type { SportDataset } from "./sport-data";
import type { Player, ScoutProfile } from "./mock-data";
import { Panel } from "@/components/ghost/ui";
import { Button } from "@/components/ui/button";
import { EventFootballPresentation } from "./event-presentation";

// Populate Lovable's original presentation contract from the existing API.
// No fixture values are carried into the connected football view.
export function FootballPresentation({ children }: { children: ReactNode }) {
  const { sport } = useSport();
  const { sourceMode } = useBackend();
  if (sport !== "football") return <>{children}</>;
  return sourceMode === "events" ? (
    <EventFootballPresentation>{children}</EventFootballPresentation>
  ) : (
    <TrackingFootballPresentation>{children}</TrackingFootballPresentation>
  );
}

function TrackingFootballPresentation({ children }: { children: ReactNode }) {
  const { sport } = useSport();
  const { match, matchId, selection, catalog } = useBackend();
  const enabled = sport === "football" && !!match;
  const playerId =
    match?.players.find((p) => p.id === "Player2")?.id ??
    match?.coverage.segments[0]?.playerIds[0] ??
    "";
  const candidates = useQuery({
    queryKey: ["ghostxi", "presentation-candidates", matchId],
    queryFn: () => ghostxi.getReplacementCandidates({ matchId, replacePlayerId: playerId }),
    enabled,
  });
  const moments = useQuery({
    queryKey: ["ghostxi", "presentation-moments", matchId],
    queryFn: () => ghostxi.getRecommendedMoments(matchId, { playerId, limit: 5 }),
    enabled,
  });
  const momentum = useQuery({
    queryKey: ["ghostxi", "momentum", matchId],
    queryFn: () => ghostxi.getMomentum(matchId),
    enabled,
  });
  const saved = useQuery({
    queryKey: ["ghostxi", "scenarios", matchId],
    queryFn: () => ghostxi.listSavedScenarios({ matchId }),
    enabled,
  });
  const selectedCandidateId = selection
    ? "replacements" in selection.scenario
      ? selection.scenario.replacements[0]?.candidatePlayerId
      : selection.scenario.candidatePlayerId
    : candidates.data?.[0]?.id;
  const assessment = useQuery({
    queryKey: [
      "ghostxi",
      "presentation-assessment",
      matchId,
      selectedCandidateId,
      selection?.scenario.id,
    ],
    queryFn: () => ghostxi.getCandidateAssessment({ matchId, candidateId: selectedCandidateId! }),
    enabled: enabled && !!selectedCandidateId,
  });
  if (sport !== "football") return <>{children}</>;
  const error = [candidates.error, moments.error, momentum.error].find(Boolean);
  if (catalog.data?.state === "unavailable" || error)
    return (
      <div className="m-6">
        <Panel title="GhostXI connection">
          <p role="alert">
            {error?.message ?? (catalog.data?.state === "unavailable" ? catalog.data.reason : "")}
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              void catalog.refetch();
              void candidates.refetch();
              void moments.refetch();
              void momentum.refetch();
            }}
          >
            Retry connection
          </Button>
        </Panel>
      </div>
    );
  if (!match || !candidates.data || !moments.data || !momentum.data)
    return (
      <div className="min-h-screen bg-background p-8 text-foreground">
        <p role="status" className="font-mono text-sm text-muted-foreground">
          Loading GhostXI football intelligence…
        </p>
      </div>
    );
  const result = selection?.result;
  const findings = result?.findings ?? [];
  const group = assessment.data?.groups[0];
  const sorted = [...candidates.data].sort(
    (a, b) => Number(b.id === selectedCandidateId) - Number(a.id === selectedCandidateId),
  );
  const profiles: Record<string, ScoutProfile> = {};
  const players: Player[] = sorted.map((c) => {
    const history = c.historicalActions.filter(
      (v): v is { minutes: number | null; stats: Record<string, number> } =>
        !!v && typeof v === "object" && "stats" in v,
    );
    const sum = (k: string) =>
      history.length ? history.reduce((total, h) => total + (h.stats[k] ?? 0), 0) : null;
    profiles[c.id] = {
      height: "Unavailable",
      value: "Unavailable",
      contract: "Unavailable",
      apps: history.length || null,
      minutes: history.length
        ? Math.round(history.reduce((n, h) => n + (h.minutes ?? 0), 0))
        : null,
      goals: sum("goals"),
      assists: sum("assists"),
      league: "source reference matches; no percentile cohort imported",
      similar: [],
      scout: c.limitations.join(" "),
      form: [],
      tags: [c.source, c.position, "Verified identity"],
      heat: [],
    };
    const isSelected = c.id === selectedCandidateId;
    return {
      id: c.id,
      name: c.name,
      age: c.ageAtHistoricalMatch,
      position: c.position,
      foot: "Unavailable",
      team: c.team ?? "Unavailable",
      nationality: "Unavailable",
      style: "Source profile",
      coverage: c.dataCoverage,
      fit: isSelected ? (group?.teamFitScore ?? null) : null,
      verdict: isSelected && group ? "Review candidate" : "Not assessed",
      summary: c.limitations[0] ?? "Verified source profile.",
      styleSummary: "Measured physical traits and historical team-style fit are unavailable.",
      strengths: isSelected && group ? group.strengths : [],
      weaknesses: c.missingAttributes.map((k) => `${k}: unavailable`),
      roles: [],
      radar: [],
      stats: Object.entries(c.attributes)
        .filter((entry): entry is [string, number] => entry[1] !== null)
        .map(([label, value]) => ({
          label: label.replace(/([A-Z])/g, " $1"),
          value: value * 100,
          per90: value.toFixed(3),
        })),
      why:
        isSelected && group
          ? group.methodology
          : "Run a source-backed scenario to calculate a role-specific review.",
    };
  });
  const defaultCandidate = players[0];
  if (!defaultCandidate || !moments.data.length)
    return (
      <div className="m-6">
        <Panel title="Source coverage">
          <p>
            No eligible candidate profiles or synchronized moments are available for this match.
          </p>
        </Panel>
      </div>
    );
  const dataMoments = moments.data.map((m, i) => ({
    id: i + 1,
    backendId: m.id,
    elapsedMinute: (m.elapsedTimeSec ?? m.timeSec) / 60,
    minute: m.timeSec / 60,
    title: m.title,
    team: m.teamId === match.teams[1]?.id ? ("away" as const) : ("home" as const),
    type: "Source event",
    impact: Math.round((m.momentumDelta ?? 0) * 1000) / 10,
    kind: m.dataStatus,
    ...(match.provider === "skillcorner"
      ? { impactLabel: `EPV ${m.momentumDelta?.toFixed(3) ?? "—"}` }
      : {}),
    description: m.description,
  }));
  const sourceOriginalId = selection
    ? "replacements" in selection.scenario
      ? selection.scenario.replacements[0]?.originalPlayerId
      : selection.scenario.originalPlayerId
    : playerId;
  const firstMoment =
    dataMoments.find((m) => m.backendId === selection?.scenario.momentId) ?? dataMoments[0]!;
  const coachInsights = findings.map((f, i) => ({
    area: `${f.branchId ?? "Scenario"} · ${f.metricId}`,
    priority: "Review",
    confidence: 0,
    kind: "simulated" as const,
    insight: f.interpretation,
  }));
  const dataset: SportDataset = {
    id: "football",
    demo: false,
    ...(match.provider === "skillcorner" ? { momentumMethod: momentum.data.methodology } : {}),
    match: {
      id: match.id,
      competition: match.competition ? `${match.competition} · ${match.season}` : match.name,
      date: match.date ?? "Date unavailable",
      venue: match.venue ?? match.source.name,
      attendance: "Source tracking",
      home: {
        name: match.teams[0]!.name,
        short: match.teams[0]!.name.slice(0, 3).toUpperCase(),
        score: match.score?.home ?? null,
        formation: "Unavailable",
      },
      away: {
        name: match.teams[1]!.name,
        short: match.teams[1]!.name.slice(0, 3).toUpperCase(),
        score: match.score?.away ?? null,
        formation: "Unavailable",
      },
      coverage: 1,
    },
    moments: dataMoments,
    momentumSeries: momentum.data.points.map((p) => ({
      minute: p.minute,
      momentum: p.value * 100,
      ghost: null,
    })),
    candidates: players,
    scoutProfiles: profiles,
    scenarios: [...dataMoments]
      .sort((a, b) => Number(b.id === firstMoment.id) - Number(a.id === firstMoment.id))
      .map((m) => ({
        id: m.backendId!,
        minute: m.minute,
        label: m.title,
        ghostId: defaultCandidate.id,
      })),
    fieldPlayers: match.players.map((p) => ({
      id: p.id,
      num:
        p.jerseyNumber ?? (match.provider === "metrica" ? Number(p.id.replace("Player", "")) : 0),
      label: p.name,
      team: p.teamId === match.teams[0]!.id ? "home" : "away",
      frames: [],
      ...(p.id === sourceOriginalId ? { role: "original" as const } : {}),
    })),
    ballFrames: { original: [], ghost: [] },
    comparison: findings.map((f) => ({
      metric: `${f.branchId} · ${f.metricId}`,
      original: f.originalValue.toFixed(3),
      ghost: f.alternativeValue.toFixed(3),
      better: f.metricId === "meanBallDistanceM" ? f.delta < 0 : f.delta > 0,
      kind: "simulated",
    })),
    coachInsights,
    coachDetails: Object.fromEntries(
      findings.map((f) => [
        `${f.branchId ?? "Scenario"} · ${f.metricId}`,
        {
          evidence: f.interpretation,
          drill: f.suggestedInvestigation,
          clip: selection?.scenario.momentId ?? "",
        },
      ]),
    ),
    dashboardKpis: [
      ["Source frames", String(match.coverage.frameCount)],
      ["Continuous windows", String(match.coverage.segments.length)],
      ["Saved scenarios", String(saved.data?.length ?? 0)],
      ["Candidate profiles", String(players.length)],
    ],
    scoreboardStats: [
      ["Tracking", `${match.fps} Hz`],
      ["Players", String(match.players.length)],
      ["Source events", String(momentum.data.eventsUsed)],
      ["Window coverage", "100%"],
    ],
    momentumKpis: [
      {
        label: "Recorded events",
        value: String(momentum.data.eventsUsed),
        sub:
          match.provider === "skillcorner"
            ? "Source possession EPV events"
            : "Same-match pass/shot locations",
        tone: "text-success",
      },
      {
        label: "Continuous windows",
        value: String(match.coverage.segments.length),
        sub: "Imported tracking windows",
        tone: "text-accent",
      },
      {
        label: "Source frames",
        value: String(match.coverage.frameCount),
        sub: `${match.fps} Hz tracking`,
        tone: "text-primary",
      },
      {
        label: "Qualified moments",
        value: String(dataMoments.length),
        sub: "No invented moments added",
        tone: "text-warning",
      },
    ],
    eventBreakdown: [
      { label: "Recorded pass/shot events", value: 100, hint: String(momentum.data.eventsUsed) },
    ],
    phases: ["Recorded source window", "Recorded source window", "Recorded source window"],
    coach: {
      tag: selection ? `Scenario · ${selection.scenario.momentId}` : "Choose a scenario",
      body: result
        ? `${findings.length} calculated findings from ${result.branches.length} modeled branches. ${result.explanations[0] ?? ""}`
        : "Run a ghost simulation in Match Lab to populate this briefing from the backend.",
      observations: result?.explanations ?? match.limitations,
      original:
        match.provider === "skillcorner"
          ? "Original source frames contain detected and provider-extrapolated positions, each labeled separately."
          : "Original player and ball coordinates come from the recorded source frames.",
      ghost: result
        ? "Alternative movement follows explicit shared model parameters."
        : "No alternative branch has been run yet.",
      wrong:
        "Historical errors and causation cannot be established from these short tracking windows.",
      improved: result
        ? (findings[0]?.interpretation ?? "No finding available.")
        : "Run a scenario to compare original and modeled metrics.",
      next: [...new Set(findings.map((f) => f.suggestedInvestigation))],
      testNext: dataMoments.map((m) => ({ label: m.title, momentId: m.id })),
    },
  };
  return <PresentationContext.Provider value={dataset}>{children}</PresentationContext.Provider>;
}
