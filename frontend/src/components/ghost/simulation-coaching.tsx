import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Brain,
  Download,
  Equal,
  FileJson,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useBackend } from "@/lib/backend-context";
import { useCoachingReport, type CoachingReport } from "@/lib/coaching-report";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "./ui";

const verdicts = {
  replace: {
    label: "Test the replacement",
    icon: ArrowRightLeft,
    tone: "border-primary/40 bg-primary/10 text-primary",
  },
  keep: {
    label: "Keep the current player",
    icon: ShieldCheck,
    tone: "border-accent/40 bg-accent/10 text-accent",
  },
  inconclusive: {
    label: "No clear advantage",
    icon: Equal,
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
} as const;

function DecisionBadge({ verdict }: { verdict: CoachingReport["verdict"] }) {
  const decision = verdicts[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        decision.tone,
      )}
    >
      <decision.icon className="size-3.5" />
      {decision.label}
    </span>
  );
}

function measurement(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return "Not measured";
  if (unit === "fraction") return `${(value * 100).toFixed(1)}% of clip`;
  if (unit === "%") return `${value.toFixed(1)}% of clip`;
  if (unit === "m") return `${value.toFixed(2)} m`;
  if (unit === "s") return `${value.toFixed(2)} s`;
  return `${value.toFixed(3)}${unit && unit !== "proxy" ? ` ${unit}` : ""}`;
}

function clipTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

function MeasurementTable({
  metrics,
  originalName,
  alternativeName,
}: {
  metrics: CoachingReport["alternatives"][number]["metrics"];
  originalName: string;
  alternativeName: string;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[440px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="pb-2 pr-3">Measure</th>
            <th className="pb-2 pr-3">{originalName}</th>
            <th className="pb-2">{alternativeName}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {metrics.map((metric) => (
            <tr key={metric.id}>
              <td className="py-2 pr-3">{metric.label}</td>
              <td className="py-2 pr-3 font-mono text-xs">
                {measurement(metric.original, metric.unit)}
              </td>
              <td className="py-2 font-mono text-xs">
                {measurement(metric.alternative, metric.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchCards({ branches }: { branches: NonNullable<CoachingReport["branches"]> }) {
  return (
    <div className="space-y-4">
      {branches.map((branch, index) => (
        <section key={`${branch.kind}-${index}`} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">
              {branch.kind === "combined" ? "Combined replacement plan" : "Individual replacement"}
            </h4>
            <DecisionBadge verdict={branch.verdict} />
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {branch.replacements.map((replacement) => (
              <li key={`${replacement.originalPlayerId}-${replacement.candidatePlayerId}`}>
                {replacement.originalPlayerName} → {replacement.candidateName}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">{branch.reason}</p>
          <MeasurementTable
            metrics={branch.metrics}
            originalName="Original lineup"
            alternativeName="Simulated lineup"
          />
        </section>
      ))}
    </div>
  );
}

/** The decision and every alternative come from completed scenario comparisons. */
export function SimulationCoaching({ variant }: { variant: "coach" | "report" }) {
  const { report, isPending, error, refetch } = useCoachingReport();
  const { match } = useBackend();
  const title = variant === "coach" ? "Smart Coach" : "Simulation Report";
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void refetch()} disabled={isPending}>
        <RefreshCw className={cn(isPending && "animate-spin")} />
        Refresh analysis
      </Button>
      <Button asChild>
        <Link to="/match-lab">
          <ArrowRightLeft />
          Open Match Lab
        </Link>
      </Button>
    </div>
  );

  if (!report || (match && report.matchId !== match.id))
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader eyebrow="Simulation decision support" title={title}>
          {actions}
        </PageHeader>
        <Panel title={error ? "Try this comparison again" : "Comparing replacement options"}>
          {error ? (
            <div role="alert" className="space-y-3 text-sm">
              <p>
                Choose another moment in Match Lab or retry the comparison to review a substitution
                decision.
              </p>
              <Button onClick={() => void refetch()}>Retry comparison</Button>
            </div>
          ) : (
            <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
              <Brain className="size-5 animate-pulse text-accent" />
              <p>
                Comparing replacement options… Reviewing movement and ball access in the selected
                moment.
              </p>
            </div>
          )}
        </Panel>
      </div>
    );

  const decision = verdicts[report.verdict];
  const namedMatch = report.context?.match ?? (match?.id === report.matchId ? match : undefined);
  const hasCombinedPlan = report.branches?.some((branch) => branch.kind === "combined") ?? false;
  function exportJson() {
    const metadata = namedMatch
      ? {
          id: namedMatch.id,
          name: namedMatch.name,
          date: namedMatch.date,
          teams: namedMatch.teams,
          score: namedMatch.score,
          competition: namedMatch.competition,
          season: namedMatch.season,
        }
      : { id: report!.matchId };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ match: metadata, analysis: report }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ghostxi-coaching-${report!.matchId.replace(/[^a-z0-9_-]/gi, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow={
          variant === "coach"
            ? "Smart Coach · substitution review"
            : "Report · substitution decision"
        }
        title={title}
      >
        {variant === "report" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refetch()} disabled={isPending}>
              <RefreshCw className={cn(isPending && "animate-spin")} />
              Refresh analysis
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Download />
              Export PDF
            </Button>
            <Button variant="outline" onClick={exportJson}>
              <FileJson />
              Export JSON
            </Button>
            <Button asChild>
              <Link to="/match-lab">Review in Match Lab</Link>
            </Button>
          </div>
        ) : (
          actions
        )}
      </PageHeader>

      {namedMatch && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <div>
            <p className="font-semibold">{namedMatch.name}</p>
            <p className="text-xs text-muted-foreground">
              {[namedMatch.competition, namedMatch.season, namedMatch.date]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {namedMatch.score && (
            <span className="font-mono text-xs text-muted-foreground">
              Final score {namedMatch.score.home}–{namedMatch.score.away}
            </span>
          )}
        </div>
      )}

      {report.context && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            <span className="font-semibold">{report.context.momentTitle}</span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              Period {report.context.period} · {clipTime(report.context.startPeriodTimeSec)}–
              {clipTime(report.context.endPeriodTimeSec)}
            </span>
          </p>
          <span className="rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground">
            {report.context.analysisOrigin === "automatic"
              ? "Automatic moment review"
              : "Saved simulation review"}
          </span>
        </div>
      )}

      <section
        className={cn(
          "rounded-2xl border bg-card bg-hero p-5 shadow-panel md:p-6",
          decision.tone.split(" ")[0],
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DecisionBadge verdict={report.verdict} />
          <span className="font-mono text-xs text-muted-foreground">
            {report.windowSeconds === null
              ? "Selected simulation"
              : `${report.windowSeconds}-second simulation`}{" "}
            · {report.alternatives.length} {report.alternatives.length === 1 ? "option" : "options"}{" "}
            compared
          </span>
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight md:text-3xl">
          {report.headline}
        </h2>
        <p className="mt-2 max-w-4xl text-base leading-relaxed text-muted-foreground">
          {report.summary}
        </p>
        {report.comparisonsTied && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            The alternatives show no meaningful difference in the measured results. There is no
            evidence here to prefer one of those players over another.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Why this decision">
          <ul className="space-y-3 text-sm">
            {report.reasons.map((reason, i) => (
              <li key={`${i}-${reason}`} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="What to do next">
          <ol className="space-y-3 text-sm">
            {report.actions.map((action, i) => (
              <li key={`${i}-${action}`} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-xs text-primary">
                  {i + 1}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {hasCombinedPlan && (
        <Panel title="Replacement plan in this simulation">
          <BranchCards branches={report.branches!} />
        </Panel>
      )}

      <Panel title={`Replacement options for ${report.originalPlayerName}`}>
        {report.alternatives.some((alternative) => alternative.availability) && (
          <p className="mb-3 text-sm text-muted-foreground">
            Match bench options belong to the source roster; reference players are comparison
            experiments.
          </p>
        )}
        {hasCombinedPlan && (
          <p className="mb-3 text-sm text-muted-foreground">
            These options vary {report.originalPlayerName}’s replacement with the other selected
            changes kept in place.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4">Player</th>
                <th className="pb-3 pr-4">Decision for this moment</th>
                <th className="pb-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.alternatives.map((alternative) => (
                <tr
                  key={alternative.candidateId}
                  className={cn(
                    report.preferredCandidateId === alternative.candidateId && "bg-primary/5",
                  )}
                >
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    {alternative.candidateName}
                    {alternative.availability && (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {alternative.availability === "match-bench"
                          ? "Match bench"
                          : "Reference player"}
                        {alternative.teamName ? ` · ${alternative.teamName}` : ""}
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4">
                    <DecisionBadge verdict={alternative.verdict} />
                  </td>
                  <td className="py-3 text-muted-foreground">{alternative.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Measured results behind the recommendation">
        <p className="mb-3 text-sm text-muted-foreground">
          Compare the original lineup with each simulated replacement over the same selected clip.
        </p>
        <div className="divide-y">
          {report.alternatives.map((alternative) => (
            <details
              key={alternative.candidateId}
              className="group py-3"
              open={report.preferredCandidateId === alternative.candidateId}
            >
              <summary className="cursor-pointer font-semibold text-sm">
                Comparison with {alternative.candidateName}
              </summary>
              {hasCombinedPlan && alternative.branches?.length ? (
                <div className="mt-3">
                  <BranchCards branches={alternative.branches} />
                </div>
              ) : (
                <MeasurementTable
                  metrics={alternative.metrics}
                  originalName={report.originalPlayerName}
                  alternativeName={`${alternative.candidateName} · simulated`}
                />
              )}
            </details>
          ))}
        </div>
      </Panel>

      <p className="text-xs leading-relaxed text-muted-foreground">{report.evidenceNote}</p>
      {error && (
        <p role="status" className="text-xs text-muted-foreground">
          The last completed comparison is shown. Use Refresh analysis to try updating it again.
        </p>
      )}
    </div>
  );
}
