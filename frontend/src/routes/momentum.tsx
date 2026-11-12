import { ConnectedMomentum } from "@/components/ghost/connected-pages";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useSport } from "@/lib/sport-context";
import { DataBadge, DemoBadge, PageHeader, Panel, StatBar } from "@/components/ghost/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/momentum")({
  head: () => ({
    meta: [
      { title: "Momentum Analysis — GhostXI" },
      {
        name: "description",
        content: "Sport-specific momentum over the match with the top momentum-changing moments.",
      },
      { property: "og:title", content: "GhostXI Momentum Analysis" },
      { property: "og:description", content: "Find the moments that swung the match." },
    ],
  }),
  component: Momentum,
});

function Momentum() {
  const { sport } = useSport();
  return <MomentumView />;
}

function MomentumView() {
  const { config, dataset } = useSport();
  const { moments, momentumSeries, match } = dataset;
  const top = [...moments].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Match Momentum · ${config.momentumStrategy.label}`}
        title="Momentum Analysis"
      >
        {dataset.demo ? <DemoBadge /> : <DataBadge kind="observed" />}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dataset.momentumKpis.map((k) => (
          <Panel key={k.label}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className={cn("font-display text-4xl font-bold", k.tone)}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </Panel>
        ))}
      </div>
      <Panel
        title="Momentum over time"
        info={`Positive = ${match.home.name} on top. Connected football charts use recorded source events; no alternative momentum curve is inferred. Strategy: ${config.momentumStrategy.drivers.join(", ")}.`}
        action={
          <div className="flex gap-2">
            <DataBadge kind="observed" />
            <DataBadge kind="simulated" />
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={momentumSeries} margin={{ top: 10, right: 10, left: -20 }}>
              <defs>
                <linearGradient id="mpos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                  <stop offset="50%" stopColor="var(--primary)" stopOpacity={0.05} />
                  <stop offset="50%" stopColor="var(--destructive)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="minute"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={config.axisTick}
              />
              <YAxis
                domain={config.id === "football" ? ["auto", "auto"] : [-80, 80]}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                labelFormatter={(v) => config.axisTick(Number(v))}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              <Area
                dataKey="momentum"
                name="Observed"
                stroke="var(--foreground)"
                fill="url(#mpos)"
                strokeWidth={2}
              />
              <Area
                dataKey="ghost"
                name="Ghost scenario"
                stroke="var(--ghost)"
                strokeDasharray="5 4"
                fill="none"
                strokeWidth={1.5}
              />
              {moments.map((m) => (
                <ReferenceDot
                  key={m.id}
                  x={Math.round(m.minute / 2) * 2}
                  y={
                    momentumSeries.find((p) => p.minute === Math.round(m.minute / 2) * 2)
                      ?.momentum ?? 0
                  }
                  r={4}
                  fill={m.impact > 0 ? "var(--success)" : "var(--destructive)"}
                  stroke="var(--background)"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      {config.id === "football" && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-display text-sm uppercase tracking-wider text-muted-foreground">
            Other imported matches · event analysis
          </summary>
          <div className="mt-4">
            <ConnectedMomentum />
          </div>
        </details>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={`Top ${top.length} momentum-changing moments`} className="lg:col-span-2">
          <ul className="divide-y">
            {top.map((m, i) => (
              <li key={m.id}>
                <Link
                  to="/match-lab"
                  search={{ moment: m.id }}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="w-6 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="w-10 font-mono text-sm text-primary">
                    {config.axisTick(m.minute)}
                  </span>
                  <span className="flex-1">
                    <span className="text-sm font-medium">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.type} · {m.team === "home" ? match.home.short : match.away.short}
                    </span>
                  </span>
                  <DataBadge kind={m.kind} />
                  <span
                    className={cn(
                      "flex w-16 items-center justify-end gap-1 font-mono text-sm",
                      m.impact > 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {m.impact > 0 ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownRight className="size-4" />
                    )}
                    {m.impact > 0 ? "+" : ""}
                    {m.impact}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Event breakdown">
          <div className="space-y-3">
            {dataset.eventBreakdown.map((e) => (
              <StatBar key={e.label} label={e.label} value={e.value} hint={e.hint} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Click any moment to open it in Match Lab.
          </p>
        </Panel>
      </div>
    </div>
  );
}
