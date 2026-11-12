import { createFileRoute } from "@tanstack/react-router";
import { Download, FileJson, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useSport } from "@/lib/sport-context";
import {
  ConfidenceBadge,
  DataBadge,
  DemoBadge,
  PageHeader,
  Panel,
  ScoreRing,
  VerdictBadge,
} from "@/components/ghost/ui";
import { Button } from "@/components/ui/button";
import { useBackend } from "@/lib/backend-context";
import { EventReport } from "@/components/ghost/event-report";
import { SimulationCoaching } from "@/components/ghost/simulation-coaching";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Analysis Report — GhostXI" },
      {
        name: "description",
        content:
          "Presentation-ready summary of the match, scenario, simulation, coaching and scouting verdict.",
      },
      { property: "og:title", content: "GhostXI Analysis Report" },
      { property: "og:description", content: "Full GhostXI decision-support report." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { sport } = useSport();
  const { sourceMode } = useBackend();
  if (sport === "football" && sourceMode === "tracking") return <SimulationCoaching variant="report" />;
  return sport === "football" && sourceMode === "events" ? <EventReport /> : <ReportsView />;
}

function ReportsView() {
  const { config, dataset } = useSport();
  const { match, scenarios, candidates, comparison, coachInsights } = dataset;
  const c = candidates[0]!;
  const original = dataset.fieldPlayers.find((p) => p.role === "original")!;

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            sport: config.id,
            match,
            scenario: scenarios[0]!,
            candidate: c,
            comparison,
            coachInsights,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ghostxi-report-${config.id}.json`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow={`Report · GXI-${config.id.toUpperCase()}`} title="Analysis Report">
        <div className="flex flex-wrap items-center gap-2">
          {dataset.demo && <DemoBadge />}
          <Button variant="outline" onClick={() => window.print()}>
            <Download />
            Export PDF
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <FileJson />
            Export JSON
          </Button>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              toast.success("Report link copied");
            }}
          >
            <Share2 />
            Share Report
          </Button>
        </div>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={`1 · Match selected · ${config.icon} ${config.name}`}>
          <p className="font-display text-2xl font-bold">
            {match.home.name} {match.home.score ?? "—"}–{match.away.score ?? "—"} {match.away.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {match.competition} · {match.date} · {match.venue}
          </p>
        </Panel>
        <Panel title="2 · Scenario summary">
          <p className="font-semibold">{scenarios[0]!.label}</p>
          <p className="text-sm text-muted-foreground">
            {dataset.moments.find((m) => m.minute === scenarios[0]!.minute)?.description} Ghost:{" "}
            {c.name}.
          </p>
          <DataBadge kind="estimated" className="mt-2" />
        </Panel>
      </div>
      <Panel
        title="3 · Candidate comparison & 4 · Simulation result"
        action={<ConfidenceBadge value={config.id === "football" ? null : 0.78} />}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2">Metric</th>
              <th>Original ({original.label})</th>
              <th>Ghost ({c.name})</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {comparison.map((r) => (
              <tr key={r.metric}>
                <td className="py-2">{r.metric}</td>
                <td className="font-mono text-warning">{r.original}</td>
                <td className={`font-mono ${r.better ? "text-success" : "text-destructive"}`}>
                  {r.ghost}
                </td>
                <td>
                  <DataBadge kind={r.kind} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="5 · Smart Coach summary">
        <ul className="grid gap-2 md:grid-cols-2">
          {coachInsights.slice(0, 4).map((i) => (
            <li key={i.area} className="rounded-md border bg-panel p-3 text-sm">
              <span className="font-semibold">{i.area}. </span>
              <span className="text-muted-foreground">{i.insight}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="6 · Final scouting verdict">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing value={c.fit} size={110} />
          <div className="flex-1">
            <p className="font-display text-2xl font-bold">{c.name}</p>
            <VerdictBadge verdict={c.verdict} className="mt-1" />
            <p className="mt-2 text-sm text-muted-foreground">{c.why}</p>
          </div>
        </div>
      </Panel>
      <p className="text-center text-xs text-muted-foreground">
        GhostXI is a decision-support tool. Simulated values are scenario estimates, not predictions
        of real outcomes.
      </p>
    </div>
  );
}
