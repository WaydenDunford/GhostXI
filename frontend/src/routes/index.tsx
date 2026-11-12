import { useBackend } from "@/lib/backend-context";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Swords,
  UserPlus,
  Play,
  GitCompare,
  FileText,
} from "lucide-react";
import { useSport } from "@/lib/sport-context";
import {
  ConfidenceBadge,
  DataBadge,
  DemoBadge,
  Panel,
  ScoreRing,
  StatBar,
  VerdictBadge,
} from "@/components/ghost/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — GhostXI" },
      {
        name: "description",
        content:
          "GhostXI overview: active match, ghost-player scenario, team fit and momentum at a glance.",
      },
      { property: "og:title", content: "GhostXI Dashboard" },
      {
        property: "og:description",
        content: "Multi-sport intelligence simulator for scouting, momentum and coaching.",
      },
    ],
  }),
  component: Dashboard,
});

const steps = [
  { label: "Select Match", icon: Swords, to: "/match-lab" },
  { label: "Choose Scenario", icon: GitCompare, to: "/momentum" },
  { label: "Add Candidate", icon: UserPlus, to: "/scouting" },
  { label: "Run Simulation", icon: Play, to: "/match-lab" },
  { label: "Compare Outcomes", icon: CheckCircle2, to: "/match-lab" },
  { label: "Review Reports", icon: FileText, to: "/reports" },
] as const;

function Dashboard() {
  const { sport } = useSport();
  return <DashboardView />;
}

function DashboardView() {
  const { config, dataset } = useSport();
  const backend = useBackend();
  const eventMode = config.id === "football" && backend.sourceMode === "events";
  const { match, moments, momentumSeries, scenarios, candidates, coachInsights } = dataset;
  const c = candidates[0]!;
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-card bg-hero p-6">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
          Decision support · not outcome prediction
        </p>
        <h1 className="font-display text-5xl font-bold tracking-tight">GhostXI</h1>
        <p className="text-lg text-muted-foreground">
          {config.icon} {config.name} Intelligence Simulator · {config.playersPerTeam}v
          {config.playersPerTeam}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/match-lab">
              Open Match Lab <ArrowRight />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/reports">View report</Link>
          </Button>
          {dataset.demo && <DemoBadge />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
        {dataset.dashboardKpis.map(([k, v]) => (
          <div key={k} className="bg-card px-4 py-3">
            <div className="text-eyebrow">{k}</div>
            <div className="font-display text-2xl font-bold tabular">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Active Match">
          <div className="flex items-center justify-between font-display text-2xl font-bold">
            <span>{match.home.short}</span>
            <span className="font-mono text-3xl">
              {match.home.score ?? "—"} – {match.away.score ?? "—"}
            </span>
            <span>{match.away.short}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {match.competition} · {match.date}
          </p>
          <DataBadge kind="observed" className="mt-3" />
        </Panel>
        <Panel title={eventMode ? "Key recorded moment" : "Selected Scenario"}>
          <p className="font-semibold">
            {eventMode ? (moments[0]?.title ?? "No key moments") : scenarios[0]?.label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {eventMode
              ? moments[0]?.description
              : moments.find((m) => m.minute === scenarios[0]?.minute)?.description}
          </p>
          <DataBadge kind={eventMode ? "observed" : "estimated"} className="mt-3" />
        </Panel>
        <Panel title={eventMode ? "Match roster spotlight" : "Candidate Player"}>
          <p className="font-semibold">
            {c.name}{" "}
            <span className="text-muted-foreground">
              · {c.age ?? "—"} · {c.position}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.team} · {c.style}
          </p>
          <span className="mt-3 inline-flex items-center gap-1 rounded border border-ghost/50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ghost">
            {eventMode ? "Recorded match player" : "◌ Ghost player"}
          </span>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Panel
          title={eventMode ? "Player match statistics" : "Team Fit Score"}
          info="Weighted fit of the candidate against the team's tactical profile."
        >
          {eventMode ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Player", c.name],
                ["Minutes", dataset.scoutProfiles[c.id]?.minutes?.toFixed(0) ?? "—"],
                ["Goals", dataset.scoutProfiles[c.id]?.goals ?? "—"],
                ["Assists", dataset.scoutProfiles[c.id]?.assists ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ScoreRing value={c.fit} size={120} />
              <VerdictBadge verdict={c.verdict} />
            </div>
          )}
        </Panel>
        <Panel
          title={eventMode ? "Shot xG momentum · trailing 5 minutes" : "Match Momentum Trend"}
          className="lg:col-span-2"
          action={<DataBadge kind={config.id === "football" ? "observed" : "simulated"} />}
        >
          <div className="h-40">
            <ResponsiveContainer>
              <AreaChart data={momentumSeries}>
                <defs>
                  <linearGradient id="dm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="minute"
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={config.axisTick}
                />
                <YAxis hide domain={[-100, 100]} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Area dataKey="momentum" stroke="var(--primary)" fill="url(#dm)" strokeWidth={2} />
                <Area
                  dataKey="ghost"
                  stroke="var(--ghost)"
                  strokeDasharray="4 3"
                  fill="none"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Data Coverage">
          <div className="space-y-3">
            <StatBar
              label="Event data"
              value={Math.round(match.coverage * 100)}
              hint={`${Math.round(match.coverage * 100)}%`}
            />
            <StatBar
              label="Tracking (on-ball)"
              value={
                eventMode
                  ? 0
                  : config.id === "football"
                    ? 100
                    : Math.round(match.coverage * 100) - 12
              }
              hint={
                eventMode
                  ? "Not available for this match"
                  : config.id === "football"
                    ? "100% of imported windows"
                    : `${Math.round(match.coverage * 100) - 12}%`
              }
            />
            <StatBar
              label="Off-ball positions"
              value={
                eventMode
                  ? 0
                  : config.id === "football"
                    ? 100
                    : Math.round(match.coverage * 100) - 24
              }
              hint={
                eventMode
                  ? "Not available for this match"
                  : config.id === "football"
                    ? "100% of imported windows"
                    : `${Math.round(match.coverage * 100) - 24}%`
              }
            />
            <ConfidenceBadge value={config.id === "football" ? null : match.coverage} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Smart Coach Summary"
          className="lg:col-span-1"
          action={<Brain className="size-4 text-accent" />}
        >
          {!coachInsights.length && (
            <p className="text-sm text-muted-foreground">{dataset.coach.body}</p>
          )}
          <ul className="space-y-2 text-sm">
            {coachInsights
              .filter((i) => i.priority === "High")
              .map((i) => (
                <li key={i.area}>
                  <span className="font-semibold text-accent">{i.area}:</span>{" "}
                  <span className="text-muted-foreground">{i.insight}</span>
                </li>
              ))}
          </ul>
        </Panel>
        <Panel title="Quick Start Workflow" className="lg:col-span-2">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link
                  to={s.to}
                  className="group flex items-center gap-3 rounded-lg border bg-panel p-3 transition-colors hover:border-primary/60"
                >
                  <span className="grid size-8 place-items-center rounded-md bg-muted font-mono text-xs text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">
                    {eventMode
                      ? [
                          "Select Match",
                          "Review Key Moments",
                          "Inspect Match Roster",
                          "Explore Actions",
                          "Review xG Trend",
                          "Review Reports",
                        ][i]
                      : s.label}
                  </span>
                  <s.icon className="ml-auto size-4 text-muted-foreground group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
