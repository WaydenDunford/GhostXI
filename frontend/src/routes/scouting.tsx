import { PlayerDirectory } from "@/components/ghost/player-directory";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Search, UserX } from "lucide-react";
import { useSport } from "@/lib/sport-context";
import { SportSurface } from "@/components/ghost/field";
import {
  ConfidenceBadge,
  DataBadge,
  DemoBadge,
  PageHeader,
  Panel,
  ScoreRing,
  StatBar,
  VerdictBadge,
} from "@/components/ghost/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scouting")({
  head: () => ({
    meta: [
      { title: "Fair Scouting — GhostXI" },
      {
        name: "description",
        content: "Evaluate talents and their fit for the team's tactical profile, per sport.",
      },
      { property: "og:title", content: "GhostXI Scouting" },
      {
        property: "og:description",
        content: "Team fit scores, radars and verdicts for candidate players.",
      },
    ],
  }),
  component: Scouting,
});

const ALL = "all";

function Scouting() {
  const { sport } = useSport();
  return (
    <>
      <ScoutingView />
      {sport === "football" && (
        <div className="mt-4">
          <PlayerDirectory />
        </div>
      )}
    </>
  );
}

function ScoutingView() {
  const { config, dataset } = useSport();
  const { candidates, scoutProfiles } = dataset;
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(ALL);
  const [team, setTeam] = useState(ALL);
  const [style, setStyle] = useState(ALL);
  const [maxAge, setMaxAge] = useState(ALL);
  const [cov, setCov] = useState(ALL);
  const [sel, setSel] = useState(candidates[0]!.id);

  // Reset filters and selection when the sport changes.
  useEffect(() => {
    setQ("");
    setPos(ALL);
    setTeam(ALL);
    setStyle(ALL);
    setMaxAge(ALL);
    setCov(ALL);
    setSel(candidates[0]!.id);
  }, [dataset.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniq = (k: "position" | "team" | "style") => [...new Set(candidates.map((c) => c[k]))];
  const list = useMemo(
    () =>
      candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) &&
          (pos === ALL || c.position === pos) &&
          (team === ALL || c.team === team) &&
          (style === ALL || c.style === style) &&
          (maxAge === ALL || (c.age !== null && c.age <= Number(maxAge))) &&
          (cov === ALL || c.coverage >= Number(cov)),
      ),
    [candidates, q, pos, team, style, maxAge, cov],
  );
  const p = list.find((c) => c.id === sel) ?? list[0];
  const sp = p ? scoutProfiles[p.id] : undefined;

  const filter = (label: string, v: string, set: (v: string) => void, opts: [string, string][]) => (
    <Select value={v} onValueChange={set}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {opts.map(([val, l]) => (
          <SelectItem key={val} value={val}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={`Fair Scouting · ${config.name}`} title="Candidate Scouting">
        {dataset.demo && <DemoBadge />}
      </PageHeader>
      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title={`Candidates (${list.length})`}>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search players…"
              className="pl-8"
            />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {filter(
              "Positions",
              pos,
              setPos,
              uniq("position").map((x) => [x, x]),
            )}
            {filter("Ages", maxAge, setMaxAge, [
              ["19", "≤ 19"],
              ["20", "≤ 20"],
              ["21", "≤ 21"],
              ["22", "≤ 22"],
            ])}
            {filter(
              "Teams",
              team,
              setTeam,
              uniq("team").map((x) => [x, x]),
            )}
            {filter(
              "Styles",
              style,
              setStyle,
              uniq("style").map((x) => [x, x]),
            )}
            <div className="col-span-2 lg:col-span-1">
              {filter("Coverage", cov, setCov, [
                ["0.6", "≥ 60% data"],
                ["0.75", "≥ 75% data"],
              ])}
            </div>
          </div>
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSel(c.id)}
                  className={cn(
                    "w-full rounded-lg border bg-panel p-3 text-left transition-colors hover:border-primary/50",
                    p?.id === c.id && "border-primary bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <span className="font-display text-xl font-bold text-primary">
                      {c.fit ?? "—"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.age ?? "—"} · {c.position} · {c.team}
                  </div>
                  <VerdictBadge verdict={c.verdict} className="mt-2" />
                </button>
              </li>
            ))}
          </ul>
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <UserX className="size-8" />
              No candidates match these filters.
            </div>
          )}
        </Panel>

        {p ? (
          <div className="space-y-4">
            <Panel>
              <div className="flex flex-wrap items-center gap-6">
                <ScoreRing value={p.fit} size={110} />
                <div className="flex-1">
                  <h2 className="font-display text-3xl font-bold">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {p.age ?? "—"} yrs · {p.position} · {p.foot} {config.lateralityLabel} · {p.team}{" "}
                    · {p.nationality}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <VerdictBadge verdict={p.verdict} />
                    <ConfidenceBadge value={config.id === "football" ? null : p.coverage} />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm">{p.summary}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Style: </span>
                {p.styleSummary}
              </p>
            </Panel>
            {sp && (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                <Panel
                  title={config.id === "football" ? "Reference profile" : "Season profile"}
                  className="md:col-span-2 2xl:col-span-1"
                  action={<DataBadge kind="observed" />}
                >
                  <dl className="grid grid-cols-3 gap-3 text-center">
                    {[
                      ["Apps", sp.apps],
                      ["Minutes", sp.minutes?.toLocaleString() ?? "—"],
                      [
                        config.contribLabel,
                        config.contribLabel.includes("+")
                          ? `${sp.goals} + ${sp.assists}`
                          : `${sp.goals}`,
                      ],
                      ["Height", sp.height],
                      ["Est. value", sp.value],
                      ["Contract", sp.contract],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-panel p-2">
                        <dt className="text-eyebrow">{k}</dt>
                        <dd className="font-mono text-sm font-semibold tabular">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {config.id === "football" ? "Reference scope:" : "Percentiles vs."} {sp.league}
                  </p>
                </Panel>
                <Panel
                  title={`Form · last 6 ${config.periodLabel === "Set" ? "matches" : "games"}`}
                >
                  <div className="flex h-24 items-end gap-2">
                    {!sp.form.length && (
                      <p className="text-sm text-muted-foreground">
                        Source match ratings unavailable.
                      </p>
                    )}
                    {sp.form.map((r, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {r.toFixed(1)}
                        </span>
                        <div
                          className={cn(
                            "w-full rounded-t",
                            r >= 7.5 ? "bg-success" : r >= 6.8 ? "bg-accent" : "bg-warning",
                          )}
                          style={{ height: `${(r - 5) * 28}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sp.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Panel>
                <Panel
                  title={config.id === "volleyball" ? "Court coverage" : "Touch map"}
                  action={<DataBadge kind="estimated" />}
                >
                  <svg viewBox="-4 -4 113 76" className="w-full rounded-md">
                    <SportSurface sport={config.id} />
                    {sp.heat.map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="9" className="fill-warning/25" />
                    ))}
                    {sp.heat.map(([x, y], i) => (
                      <circle key={`c${i}`} cx={x} cy={y} r="3.5" className="fill-destructive/40" />
                    ))}
                  </svg>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {config.id === "football"
                      ? "Candidate touch map unavailable for this source match"
                      : "Attacking left → right"}
                  </p>
                </Panel>
              </div>
            )}
            {sp && (
              <Panel title="Scout report">
                <blockquote className="border-l-2 border-primary pl-3 text-sm italic">
                  {sp.scout}
                </blockquote>
                <p className="mt-3 text-xs text-muted-foreground">
                  {config.id === "football"
                    ? "Verified comparables:"
                    : "Statistical comparables at the same age:"}{" "}
                  <span className="text-foreground">
                    {sp.similar.length ? sp.similar.join(" · ") : "Unavailable"}
                  </span>
                </p>
              </Panel>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Attribute radar">
                <div className="h-64">
                  {!p.radar.length && (
                    <p className="text-sm text-muted-foreground">
                      Measured attribute ratings are unavailable.
                    </p>
                  )}
                  <ResponsiveContainer>
                    <RadarChart data={p.radar}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      />
                      <Radar
                        dataKey="value"
                        stroke="var(--ghost)"
                        fill="var(--ghost)"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel
                title={config.id === "football" ? "Source metrics" : "Key metrics (percentile)"}
              >
                <div className="space-y-3">
                  {p.stats.map((s) => (
                    <StatBar
                      key={s.label}
                      label={`${s.label} · ${s.per90}`}
                      value={s.value}
                      hint={config.id === "football" ? s.per90 : `P${s.value}`}
                    />
                  ))}
                </div>
                <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Role suitability
                </h4>
                <div className="space-y-2">
                  {p.roles.map((r) => (
                    <StatBar key={r.role} label={r.role} value={r.score} />
                  ))}
                </div>
              </Panel>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Strengths">
                <ul className="space-y-1 text-sm">
                  {p.strengths.map((s) => (
                    <li key={s} className="text-success">
                      + <span className="text-foreground">{s}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Weaknesses">
                <ul className="space-y-1 text-sm">
                  {p.weaknesses.map((s) => (
                    <li key={s} className="text-destructive">
                      − <span className="text-foreground">{s}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Why this player fits this team">
                <p className="text-sm text-muted-foreground">{p.why}</p>
              </Panel>
            </div>
          </div>
        ) : (
          <Panel>
            <div className="py-20 text-center text-muted-foreground">
              Select a candidate to see the full profile.
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
