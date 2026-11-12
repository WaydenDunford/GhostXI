import { useBackend } from "@/lib/backend-context";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, Crosshair, Eye, Footprints, Route as RouteIcon, Shield, Timer } from "lucide-react";
import { useSport } from "@/lib/sport-context";
import { Clapperboard, Dumbbell } from "lucide-react";
import {
  ConfidenceBadge,
  DataBadge,
  DemoBadge,
  PageHeader,
  Panel,
  VerdictBadge,
} from "@/components/ghost/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Smart Coach — GhostXI" },
      {
        name: "description",
        content:
          "Explainable tactical and player-specific coaching insights from ghost-player scenarios.",
      },
      { property: "og:title", content: "GhostXI Smart Coach" },
      {
        property: "og:description",
        content: "AI tactical assistant with prioritised, confidence-rated recommendations.",
      },
    ],
  }),
  component: Coach,
});

const icons: Record<string, typeof Brain> = {
  Positioning: Crosshair,
  Timing: Timer,
  Awareness: Eye,
  "Passing option selection": RouteIcon,
  "Movement into space": Footprints,
  "Defensive recovery": Shield,
};
const prio: Record<string, string> = {
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-warning/15 text-warning",
  Low: "bg-muted text-muted-foreground",
};

function Coach() {
  const { sport } = useSport();
  return <CoachView />;
}

function CoachView() {
  const { config, dataset } = useSport();
  const { sourceMode } = useBackend();
  const eventMode = config.id === "football" && sourceMode === "events";
  const { coachInsights, coachDetails, candidates, coach } = dataset;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow={`Smart Coach · ${config.name}`} title="Tactical Assistant">
        <span className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent">
          <Brain className="size-4" />
          {coach.tag}
        </span>
        {dataset.demo && <DemoBadge />}
      </PageHeader>
      <section className="rounded-xl border border-accent/30 bg-card bg-hero p-5 shadow-panel">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent shadow-glow">
            <Brain className="size-6" />
          </span>
          <div className="flex-1">
            <p className="text-eyebrow">
              Post-match briefing · prepared for Head Coach & Analysis Dept.
            </p>
            <p className="mt-1 text-lg leading-relaxed">{coach.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ConfidenceBadge value={config.id === "football" ? null : 0.81} />
              <DataBadge kind={eventMode ? "observed" : "simulated"} />
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                {config.id === "football"
                  ? eventMode
                    ? "Recorded match events · descriptive analysis"
                    : "Deterministic backend model · recorded source windows"
                  : "Based on 500 sim runs · 3 clips"}
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={eventMode ? "Calculation and source" : "Key tactical observations"}>
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
            {coach.observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel title={eventMode ? "Recorded action locations" : "Original player"}>
            <p className="text-sm text-muted-foreground">{coach.original}</p>
            <DataBadge kind="observed" className="mt-2" />
          </Panel>
          <Panel title={eventMode ? "Tracking availability" : "Ghost did differently"}>
            <p className="text-sm text-muted-foreground">{coach.ghost}</p>
            {!eventMode && <DataBadge kind="simulated" className="mt-2" />}
          </Panel>
          <Panel title={eventMode ? "Event-data limits" : "What went wrong"}>
            <p className="text-sm text-muted-foreground">{coach.wrong}</p>
          </Panel>
          <Panel title={eventMode ? "Review next" : "What improved"}>
            <p className="text-sm text-muted-foreground">{coach.improved}</p>
          </Panel>
        </div>
      </div>

      <div className="flex items-end justify-between pt-2">
        <h2 className="font-display text-xl font-bold">Coaching recommendations</h2>
        <span className="text-eyebrow">Sorted by area · {coachInsights.length} insights</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {coachInsights.map((i) => {
          const Icon = icons[i.area] ?? Brain;
          return (
            <Panel key={i.area}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-md bg-accent/15 text-accent">
                  <Icon className="size-4" />
                </span>
                <h3 className="font-semibold">{i.area}</h3>
                <span
                  className={cn(
                    "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    prio[i.priority],
                  )}
                >
                  {i.priority}
                </span>
              </div>
              <p className="text-sm">{i.insight}</p>
              {coachDetails[i.area] && (
                <dl className="mt-3 space-y-1.5 rounded-md bg-panel p-2.5 text-xs">
                  <div>
                    <dt className="text-eyebrow">Evidence</dt>
                    <dd className="text-muted-foreground">{coachDetails[i.area]!.evidence}</dd>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Dumbbell className="size-3.5 text-primary" />
                    {coachDetails[i.area]!.drill}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clapperboard className="size-3.5 text-accent" />
                    Clip {coachDetails[i.area]!.clip}
                  </div>
                </dl>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfidenceBadge value={config.id === "football" ? null : i.confidence} />
                <DataBadge kind={i.kind} />
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={eventMode ? "Match players to review" : "Recommended substitution alternatives"}
        >
          <ul className="space-y-2">
            {candidates.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span>
                  {c.name} <span className="text-muted-foreground">({c.position})</span>
                </span>
                <VerdictBadge verdict={c.verdict} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="What to improve next">
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            {coach.next.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </Panel>
        <Panel title={eventMode ? "Recorded moments to review" : "Which scenarios to test next"}>
          <ul className="space-y-1.5 text-sm">
            {coach.testNext.map((n) => (
              <li key={n.label}>
                <Link
                  to="/match-lab"
                  search={{ moment: n.momentId }}
                  className="text-accent hover:underline"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
