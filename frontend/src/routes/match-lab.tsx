import { VerifiedLab } from "@/components/ghost/verified-lab";
import { EventMatchLab } from "@/components/ghost/event-match-lab";
import { useBackend } from "@/lib/backend-context";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  GitCompare,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSport } from "@/lib/sport-context";
import {
  createMockApi,
  type RecommendedMoment,
  type ReplacementCandidate,
  type SimulationResult,
  type SimulationScenario,
} from "@/lib/simulation-api";
import { squads, type SquadPlayer } from "@/lib/squad-data";
import type { PitchPlayer } from "@/lib/mock-data";
import { Pitch } from "@/components/ghost/pitch";
import { RealMatchPanel } from "@/components/ghost/real-match-panel";
import { SimulationField, SportSurface, type FieldMode } from "@/components/ghost/field";
import {
  ConfidenceBadge,
  DataBadge,
  DemoBadge,
  Panel,
  StatBar,
  VerdictBadge,
} from "@/components/ghost/ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match-lab")({
  validateSearch: (s: Record<string, unknown>): { moment?: number } =>
    s["moment"] !== undefined ? { moment: Number(s["moment"]) } : {},
  head: () => ({
    meta: [
      { title: "Match Lab — GhostXI" },
      {
        name: "description",
        content:
          "Interactive substitution lab: click a player, pick a replacement, test a moment, run the ghost simulation.",
      },
      { property: "og:title", content: "GhostXI Match Lab" },
      {
        property: "og:description",
        content: "Original vs. ghost-player scenario on a tactical field.",
      },
    ],
  }),
  component: MatchLab,
});

type View = "original" | "ghost" | "split" | "overlay";
const DURATION = 6000;
const ALL = "all";

function MatchLab() {
  const { sport } = useSport();
  const { sourceMode, eventId } = useBackend();
  return sport === "football" ? (
    sourceMode === "events" ? (
      <EventMatchLab key={eventId} />
    ) : (
      <VerifiedLab />
    )
  ) : (
    <GenericLab />
  );
}

function GenericLab() {
  const { moment } = Route.useSearch();
  const { sport, config, dataset } = useSport();
  const { match, moments } = dataset;
  const api = useMemo(() => createMockApi(sport), [sport]);
  const squad = squads[sport];

  const defaultOriginal = dataset.fieldPlayers.find((p) => p.role === "original")!;
  const defaultGhostId = dataset.scenarios[0]!.ghostId;

  // Selection state
  const [selectedPlayerId, setSelectedPlayerId] = useState(defaultOriginal.id);
  const [candidateId, setCandidateId] = useState<string>(defaultGhostId);
  const [activeMomentId, setActiveMomentId] = useState<number>(
    moment ?? moments.find((m) => m.minute === dataset.scenarios[0]!.minute)?.id ?? moments[0]!.id,
  );

  // Replay state
  const [view, setView] = useState<View>("overlay");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState("1");
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);

  // API-backed state
  const [recommendations, setRecommendations] = useState<RecommendedMoment[]>([]);
  const [replacements, setReplacements] = useState<ReplacementCandidate[]>([]);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [saved, setSaved] = useState<SimulationScenario[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Filters
  const [fPos, setFPos] = useState(ALL);
  const [fAge, setFAge] = useState(ALL);
  const [fFit, setFFit] = useState(ALL);

  const selectedPlayer: SquadPlayer =
    [...squad.starting, ...squad.bench].find((p) => p.id === selectedPlayerId) ??
    squad.starting[0]!;
  const activeMoment = moments.find((m) => m.id === activeMomentId) ?? moments[0]!;
  const candidate = replacements.find((r) => r.id === candidateId) ?? null;
  const scoutingCandidate = dataset.candidates.find((c) => c.id === candidateId);

  // Reset everything when the sport changes.
  useEffect(() => {
    setSelectedPlayerId(defaultOriginal.id);
    setCandidateId(defaultGhostId);
    setActiveMomentId(
      moments.find((m) => m.minute === dataset.scenarios[0]!.minute)?.id ?? moments[0]!.id,
    );
    setSimResult(null);
    setCompareIds([]);
    setCompareOpen(false);
    setT(0);
    setPlaying(true);
  }, [dataset.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load recommendations + replacements + saved scenarios from the (mock) API.
  useEffect(() => {
    let live = true;
    void api.getMoments(match.id, selectedPlayerId, 5).then((r) => {
      if (live) setRecommendations(r);
    });
    void api.getCandidates(match.id, selectedPlayerId).then((r) => {
      if (live) setReplacements(r);
    });
    return () => {
      live = false;
    };
  }, [api, match.id, selectedPlayerId]);
  const refreshSaved = () => void api.listScenarios().then(setSaved);
  useEffect(() => {
    refreshSaved();
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen
  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

  // Replay clock
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current != null) {
        setT((p) => {
          const n = p + ((now - last.current!) / DURATION) * Number(speed);
          return n >= 1 ? 1 : Math.max(0, n);
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);
  useEffect(() => {
    if (t >= 1) setPlaying(false);
  }, [t]);

  // Build the field players: selected player becomes the original branch,
  // the chosen candidate becomes the ghost branch.
  const fieldPlayers: PitchPlayer[] = useMemo(() => {
    const ghostName = candidate?.name ?? scoutingCandidate?.name ?? "Ghost";
    const ghostLabel = ghostName.split(" ").slice(-1)[0]!;
    // During a sport switch the selected id may not exist in the new dataset yet.
    const hasSelected = dataset.fieldPlayers.some((p) => p.id === selectedPlayerId);
    const effectiveId = hasSelected ? selectedPlayerId : defaultOriginal.id;
    return dataset.fieldPlayers
      .filter((p) => p.role !== "ghost")
      .map((p) => {
        if (p.id === effectiveId) return { ...p, role: "original" as const };
        if (p.role === "original") {
          const rest = { ...p };
          delete rest.role;
          return rest;
        }
        return p;
      })
      .concat([
        {
          id: "ghost",
          num: selectedPlayer.num,
          label: ghostLabel,
          team: "home" as const,
          role: "ghost" as const,
          frames: ghostFrames(dataset.fieldPlayers, effectiveId),
        },
      ]);
  }, [
    dataset.fieldPlayers,
    selectedPlayerId,
    selectedPlayer.num,
    candidate,
    scoutingCandidate,
    defaultOriginal.id,
  ]);

  const minuteLabel = config.formatClock(t, activeMoment.minute);
  const phase = t < 0.33 ? dataset.phases[0] : t < 0.66 ? dataset.phases[1] : dataset.phases[2];
  const viewLabel = {
    original: "Original",
    ghost: "Ghost",
    split: "Split",
    overlay: "Overlay",
  } as const;

  const runSimulation = async () => {
    setSimRunning(true);
    const result = await api.simulate({
      id: `tmp-${Date.now()}`,
      sportId: sport,
      matchId: match.id,
      momentId: String(activeMoment.id),
      originalPlayerId: selectedPlayerId,
      candidatePlayerId: candidateId,
      seed: 0,
    });
    setSimResult(result);
    setSimRunning(false);
    setT(0);
    setPlaying(true);
    setView("overlay");
    toast.success("Ghost simulation completed", {
      description: "Demo adapter — directional results, not a live engine.",
    });
  };

  const saveScenario = async () => {
    await api.createScenario({
      sportId: sport,
      matchId: match.id,
      momentId: String(activeMoment.id),
      originalPlayerId: selectedPlayerId,
      candidatePlayerId: candidateId,
    });
    refreshSaved();
    toast.success("Scenario saved", {
      description: `${activeMoment.title} · ${candidate?.name ?? scoutingCandidate?.name ?? "candidate"}`,
    });
  };

  const loadScenario = (s: SimulationScenario) => {
    setSelectedPlayerId(s.originalPlayerId);
    setCandidateId(s.candidatePlayerId);
    setActiveMomentId(Number(s.momentId));
    setT(0);
    setPlaying(true);
  };

  const testMoment = (rm: RecommendedMoment) => {
    setActiveMomentId(Number(rm.id.replace("rm-", "")));
    setT(0);
    setPlaying(true);
  };

  const filteredReplacements = replacements.filter(
    (r) =>
      (fPos === ALL || r.position === fPos) &&
      (fAge === ALL || (squad.bench.find((b) => b.id === r.id)?.age ?? 21) <= Number(fAge)) &&
      (fFit === ALL || (r.positionFit ?? 0) >= Number(fFit)),
  );

  const field = (mode: FieldMode, showLabels: boolean, cls: string) =>
    config.id === "football" && selectedPlayerId === defaultOriginal.id ? (
      <Pitch
        t={t}
        mode={mode}
        showLabels={showLabels}
        className={cls}
        onPlayerClick={(id) => {
          const sp = squad.starting.find((x) => x.id === id);
          if (sp) setSelectedPlayerId(id);
        }}
        selectedId={selectedPlayerId}
      />
    ) : (
      <SimulationField
        t={t}
        mode={mode}
        showLabels={showLabels}
        className={cls}
        surface={<SportSurface sport={config.id} />}
        players={fieldPlayers}
        ballFrames={dataset.ballFrames}
        ballClassName={config.id === "hockey" ? "fill-background stroke-foreground/60" : undefined}
        onPlayerClick={(id) => {
          const sp = squad.starting.find((x) => x.id === id);
          if (sp) setSelectedPlayerId(id);
        }}
        selectedId={selectedPlayerId}
      />
    );

  const candidateRow = (r: ReplacementCandidate) => {
    const natural = r.position === selectedPlayer.position;
    const secondary = r.secondaryPositions.includes(selectedPlayer.position);
    return (
      <li key={r.id}>
        <button
          onClick={() => setCandidateId(r.id)}
          className={cn(
            "w-full rounded-lg border bg-panel p-2.5 text-left transition-colors hover:border-primary/50",
            candidateId === r.id && "border-ghost bg-ghost/5",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{r.name}</span>
            <span className="font-mono text-xs text-primary">{r.positionFit ?? "—"}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {r.position}
              {r.secondaryPositions.length > 0 &&
                ` · also ${r.secondaryPositions.slice(0, 2).join(", ")}`}
            </span>
            <span
              className={cn(
                "rounded px-1 font-mono text-[9px] uppercase",
                natural
                  ? "bg-success/15 text-success"
                  : secondary
                    ? "bg-warning/15 text-warning"
                    : "bg-destructive/15 text-destructive",
              )}
            >
              {natural ? "Natural" : secondary ? "Secondary" : "Override"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ghost"
                style={{ width: `${r.dataCoverage * 100}%` }}
              />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground">
              {Math.round(r.dataCoverage * 100)}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCompareIds((ids) =>
                  ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id],
                );
              }}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                compareIds.includes(r.id) ? "border-accent text-accent" : "text-muted-foreground",
              )}
            >
              Compare
            </button>
          </div>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {sport === "football" && <RealMatchPanel />}
      {/* Broadcast scoreboard */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-panel">
        <span className="flex items-center gap-2 rounded bg-destructive/15 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-destructive">
          <span className={cn("size-1.5 rounded-full bg-destructive", playing && "animate-live")} />
          {playing ? "Live replay" : "Paused"}
        </span>
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-md bg-home font-display text-sm font-bold">
            {match.home.short}
          </span>
          <span className="hidden font-semibold sm:inline">{match.home.name}</span>
          <span className="rounded-md bg-background px-3 py-1 font-mono text-2xl font-bold tabular">
            {match.home.score}
            <span className="mx-2 text-muted-foreground">:</span>
            {match.away.score}
          </span>
          <span className="hidden font-semibold sm:inline">{match.away.name}</span>
          <span className="grid size-8 place-items-center rounded-md bg-away font-display text-sm font-bold">
            {match.away.short}
          </span>
        </div>
        <span className="rounded-md bg-primary/15 px-2.5 py-1 font-mono text-lg text-primary tabular">
          {minuteLabel}
        </span>
        <div className="ml-auto hidden items-center gap-5 text-xs md:flex">
          {dataset.scoreboardStats.map(([k, v]) => (
            <div key={k}>
              <div className="text-eyebrow">{k}</div>
              <div className="font-mono tabular">{v}</div>
            </div>
          ))}
        </div>
        {api.isDemo && <DemoBadge />}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)_310px]">
        {/* LEFT — Squad & Substitutions */}
        <Panel title="Squad & Substitutions" className="order-2 xl:order-1">
          {/* Selected player profile */}
          <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold">
                #{selectedPlayer.num} {selectedPlayer.name}
              </span>
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                {selectedPlayer.position}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedPlayer.age} yrs · rating {selectedPlayer.rating} · coverage{" "}
              {Math.round(selectedPlayer.coverage * 100)}%
            </p>
            <div className="mt-2 space-y-1.5">
              {Object.entries(selectedPlayer.attributes)
                .slice(0, 4)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-[10px]">
                    <span className="w-24 truncate text-muted-foreground">{k}</span>
                    <div className="h-1 flex-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${v ?? 0}%` }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono">{v ?? "—"}</span>
                  </div>
                ))}
            </div>
          </div>

          <Tabs defaultValue="xi">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="xi" className="text-[11px]">
                Starting XI
              </TabsTrigger>
              <TabsTrigger value="bench" className="text-[11px]">
                Bench
              </TabsTrigger>
              <TabsTrigger value="pool" className="text-[11px]">
                Talent Pool
              </TabsTrigger>
            </TabsList>
            <TabsContent value="xi" className="mt-2">
              <ul className="space-y-1">
                {squad.starting.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedPlayerId(p.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                        selectedPlayerId === p.id && "bg-accent/10 font-semibold text-accent",
                      )}
                    >
                      <span className="w-6 font-mono text-xs text-muted-foreground">{p.num}</span>
                      <span className="flex-1">{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.position}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          p.rating >= 6.8
                            ? "text-success"
                            : p.rating >= 6.3
                              ? "text-warning"
                              : "text-destructive",
                        )}
                      >
                        {p.rating.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="bench" className="mt-2">
              <ReplacementFilters
                fPos={fPos}
                setFPos={setFPos}
                fAge={fAge}
                setFAge={setFAge}
                fFit={fFit}
                setFFit={setFFit}
                positions={[...new Set(replacements.map((r) => r.position))]}
              />
              <ul className="mt-2 space-y-2">
                {filteredReplacements.filter((r) => r.source === "bench").map(candidateRow)}
              </ul>
            </TabsContent>
            <TabsContent value="pool" className="mt-2">
              <ReplacementFilters
                fPos={fPos}
                setFPos={setFPos}
                fAge={fAge}
                setFAge={setFAge}
                fFit={fFit}
                setFFit={setFFit}
                positions={[...new Set(replacements.map((r) => r.position))]}
              />
              <ul className="mt-2 space-y-2">
                {filteredReplacements.filter((r) => r.source === "scouting").map(candidateRow)}
              </ul>
            </TabsContent>
          </Tabs>
        </Panel>

        {/* CENTER — Field + controls */}
        <div className="order-1 space-y-4 xl:order-2">
          <div
            ref={stageRef}
            className="flex flex-col overflow-hidden rounded-xl border bg-stands shadow-panel fullscreen:rounded-none fullscreen:border-0"
          >
            <div className="flex items-center justify-between px-5 pt-4 text-xs">
              <span className="text-eyebrow">
                {match.venue} · {match.attendance}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded border border-border/60 bg-background/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {phase}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={toggleFullscreen}
                  aria-label={isFull ? "Exit fullscreen" : "Fullscreen pitch"}
                  title={isFull ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFull ? <Minimize /> : <Maximize />}
                </Button>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center px-6 py-6 md:px-8">
              {view === "split" ? (
                <div className="grid gap-6 xl:grid-cols-2 fullscreen:grid-cols-2">
                  <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-warning">
                      Original · #{selectedPlayer.num} {selectedPlayer.name}
                    </p>
                    {field("original", false, "stand-ring rounded-md")}
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ghost">
                      Ghost · {candidate?.name ?? scoutingCandidate?.name ?? "—"}
                    </p>
                    {field("ghost", false, "stand-ring rounded-md")}
                  </div>
                </div>
              ) : (
                field(view as FieldMode, true, "stand-ring rounded-md")
              )}
            </div>
            <p className="px-5 pb-1 text-center text-[11px] text-muted-foreground">
              Click any highlighted player on the {config.surfaceLabel.toLowerCase()} to select them
              for substitution.
            </p>
            {/* Transport + ghost controls */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/60 px-4 py-3 backdrop-blur">
              <div className="flex gap-1.5">
                <Button
                  size="icon"
                  onClick={() => {
                    if (t >= 1) setT(0);
                    setPlaying(true);
                  }}
                  aria-label="Play"
                  disabled={playing}
                >
                  <Play />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => setPlaying(false)}
                  aria-label="Pause"
                  disabled={!playing}
                >
                  <Pause />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    setT(0);
                    setPlaying(true);
                  }}
                  aria-label="Replay"
                >
                  <RotateCcw />
                </Button>
              </div>
              <Select value={speed} onValueChange={setSpeed}>
                <SelectTrigger className="w-20" aria-label="Speed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["0.5", "1", "2", "4"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(t * 1000)}
                onChange={(e) => {
                  setPlaying(false);
                  setT(Number(e.target.value) / 1000);
                }}
                className="min-w-32 flex-1 accent-primary"
                aria-label="Scrub"
              />
              <Button
                size="icon"
                variant="secondary"
                onClick={toggleFullscreen}
                aria-label={isFull ? "Exit fullscreen" : "Fullscreen pitch"}
              >
                {isFull ? <Minimize /> : <Maximize />}
              </Button>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v as View)}
                variant="outline"
                size="sm"
              >
                {(Object.keys(viewLabel) as View[]).map((v) => (
                  <ToggleGroupItem
                    key={v}
                    value={v}
                    className="px-3 data-[state=on]:bg-ghost/20 data-[state=on]:text-ghost"
                  >
                    {viewLabel[v]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/40 px-4 py-2.5">
              <Button
                size="sm"
                onClick={runSimulation}
                disabled={simRunning || !candidateId}
                className="shadow-glow"
              >
                <Zap />
                {simRunning ? "Simulating…" : "Run Ghost Simulation"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setT(0);
                  setPlaying(true);
                  setView("original");
                }}
              >
                Original Replay
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setT(0);
                  setPlaying(true);
                  setView("ghost");
                }}
              >
                Ghost Replay
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSimResult(null);
                  setT(0);
                  setPlaying(false);
                  setView("overlay");
                }}
              >
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={saveScenario}>
                <Save />
                Save Scenario
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCompareOpen((o) => !o)}
                disabled={compareIds.length === 0}
              >
                <GitCompare />
                Compare Candidates{compareIds.length > 0 && ` (${compareIds.length})`}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 bg-background/40 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-home" />
                {match.home.short}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-away" />
                {match.away.short}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 border-warning" />
                Original
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 border-dashed border-ghost" />
                Ghost
              </span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                <DataBadge kind="observed" />
                <DataBadge kind="estimated" />
                <DataBadge kind="simulated" />
              </span>
            </div>
          </div>

          {/* Candidate comparison table */}
          {compareOpen && compareIds.length > 0 && (
            <Panel title={`Candidate comparison · ${activeMoment.title}`} action={<DemoBadge />}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Candidate</th>
                    <th>Position</th>
                    <th>Fit to {selectedPlayer.position}</th>
                    <th>Coverage</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {compareIds.map((id) => {
                    const r = replacements.find((x) => x.id === id);
                    if (!r) return null;
                    return (
                      <tr key={id} className={cn(candidateId === id && "bg-ghost/5")}>
                        <td className="py-2 font-medium">{r.name}</td>
                        <td className="font-mono text-xs">{r.position}</td>
                        <td className="font-mono text-primary">{r.positionFit ?? "—"}</td>
                        <td className="font-mono text-xs">{Math.round(r.dataCoverage * 100)}%</td>
                        <td className="text-xs text-muted-foreground">
                          {r.source === "bench" ? "Bench" : "Scouting pool"}
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setCandidateId(id)}>
                            Use as ghost
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </div>

        {/* RIGHT — Recommended moments + results */}
        <div className="order-3 space-y-4">
          <Panel
            title="Recommended Moments to Test"
            info={`Moments relevant to ${selectedPlayer.name} (${selectedPlayer.position}), ranked by position relevance and momentum impact.`}
            action={<DemoBadge />}
          >
            <ul className="space-y-2.5">
              {recommendations.map((rm) => (
                <li
                  key={rm.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    activeMomentId === Number(rm.id.replace("rm-", "")) &&
                      "border-ghost bg-ghost/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">
                      {config.axisTick(rm.timeSec / 60)}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs",
                        rm.momentumDelta > 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {rm.momentumDelta > 0 ? "+" : ""}
                      {rm.momentumDelta}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium">{rm.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{rm.description}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {rm.relevanceReasons.slice(0, 2).map((r) => (
                      <li key={r} className="text-[10px] text-accent">
                        ▸ {r}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <DataBadge kind={rm.dataStatus} />
                      <span className="font-mono text-[9px] text-muted-foreground">
                        cov {Math.round(rm.dataCoverage * 100)}%
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => testMoment(rm)}
                    >
                      Test This Moment
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Smart Coach results */}
          {simResult && (
            <Panel title="Smart Coach · Simulation Results" action={<DemoBadge />}>
              <div className="mb-3 flex items-center justify-between rounded-md bg-panel p-2.5">
                <span className="text-xs text-muted-foreground">Possession value Δ</span>
                <span
                  className={cn(
                    "font-mono text-lg font-bold",
                    (simResult.metrics.delta ?? 0) < 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {simResult.metrics.originalValue?.toFixed(2)} →{" "}
                  {simResult.metrics.alternativeValue?.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2.5">
                {simResult.breakdown.map((b) => (
                  <div key={b.label}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{b.label}</span>
                      <DataBadge kind={b.dataStatus} />
                    </div>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-warning">{b.original}</span>
                      <span className={b.better ? "text-success" : "text-destructive"}>
                        {b.ghost}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Analysis
              </h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {simResult.explanations.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
              <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Coaching improvements
              </h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {simResult.coaching.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
              <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Limitations
              </h4>
              <ul className="space-y-1 text-[11px] text-warning">
                {simResult.limitations.map((e) => (
                  <li key={e}>⚠ {e}</li>
                ))}
              </ul>
              {scoutingCandidate && (
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <span className="text-sm">
                    Team fit{" "}
                    <span className="font-mono font-bold text-primary">
                      {scoutingCandidate.fit}
                    </span>
                  </span>
                  <VerdictBadge verdict={scoutingCandidate.verdict} />
                </div>
              )}
              <div className="mt-2">
                <ConfidenceBadge value={simResult.dataCoverage} />
              </div>
            </Panel>
          )}

          {/* Ghost profile */}
          {scoutingCandidate && (
            <Panel title="Ghost profile">
              <div className="space-y-2.5">
                {scoutingCandidate.stats.map((s) => (
                  <StatBar key={s.label} label={s.label} value={s.value} hint={s.per90} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* BOTTOM — Timeline + saved scenarios */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel
          title="Match timeline · momentum swings"
          info={`Bars above the line favour ${match.home.name}, below favour ${match.away.name}. Click to load a moment.`}
        >
          <div className="relative h-24">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border/60" />
            {moments.map((m) => {
              const h = Math.abs(m.impact) * 0.9;
              return (
                <button
                  key={m.id}
                  title={`${config.axisTick(m.minute)} ${m.title}`}
                  onClick={() => {
                    setActiveMomentId(m.id);
                    setT(0);
                    setPlaying(true);
                  }}
                  className="group absolute flex -translate-x-1/2 flex-col items-center"
                  style={{
                    left: `${(m.minute / config.maxTime) * 100}%`,
                    ...(m.impact > 0 ? { bottom: "50%" } : { top: "50%" }),
                  }}
                >
                  {m.impact > 0 && (
                    <span className="mb-1 font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                      {config.axisTick(m.minute)}
                    </span>
                  )}
                  <div
                    className={cn(
                      "w-1.5 rounded-sm transition-all group-hover:w-2.5",
                      m.impact > 0 ? "bg-success" : "bg-destructive",
                      m.id === activeMomentId && "ring-2 ring-ghost",
                    )}
                    style={{ height: h }}
                  />
                  {m.impact < 0 && (
                    <span className="mt-1 font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                      {config.axisTick(m.minute)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{config.periodLabel === "Set" ? "S1" : "Start"}</span>
            <span>{config.periods}</span>
            <span>{config.periodLabel === "Set" ? "S5" : "End"}</span>
          </div>
        </Panel>

        <Panel
          title={`Saved scenarios (${saved.length})`}
          info="Saved locally in this browser. Run, duplicate or delete them here."
        >
          {saved.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No saved scenarios yet. Configure a substitution and hit Save Scenario.
            </p>
          )}
          <ul className="space-y-2">
            {saved.map((s) => {
              const m = moments.find((x) => String(x.id) === s.momentId);
              const cand = dataset.candidates.find((c) => c.id === s.candidatePlayerId);
              const benchP = squad.bench.find((b) => b.id === s.candidatePlayerId);
              return (
                <li key={s.id} className="rounded-lg border bg-panel p-2.5">
                  <p className="text-xs font-medium">{m?.title ?? s.momentId}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ghost: {cand?.name ?? benchP?.name ?? s.candidatePlayerId}
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => loadScenario(s)}
                    >
                      <Play className="size-3" />
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => void api.duplicateScenario(s.id).then(refreshSaved)}
                    >
                      <Copy className="size-3" />
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-destructive"
                      onClick={() => void api.deleteScenario(s.id).then(refreshSaved)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function ReplacementFilters({
  fPos,
  setFPos,
  fAge,
  setFAge,
  fFit,
  setFFit,
  positions,
}: {
  fPos: string;
  setFPos: (v: string) => void;
  fAge: string;
  setFAge: (v: string) => void;
  fFit: string;
  setFFit: (v: string) => void;
  positions: string[];
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <Select value={fPos} onValueChange={setFPos}>
        <SelectTrigger className="h-7 text-[10px]" aria-label="Position filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All pos</SelectItem>
          {positions.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={fAge} onValueChange={setFAge}>
        <SelectTrigger className="h-7 text-[10px]" aria-label="Age filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any age</SelectItem>
          {["21", "23", "25"].map((a) => (
            <SelectItem key={a} value={a}>
              ≤ {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={fFit} onValueChange={setFFit}>
        <SelectTrigger className="h-7 text-[10px]" aria-label="Fit filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any fit</SelectItem>
          {(
            [
              ["60", "Fit ≥ 60"],
              ["80", "Fit ≥ 80"],
            ] as [string, string][]
          ).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Ghost movement branch: hand-authored for the dataset's default anchor play;
// otherwise a deterministic "better positioning" transform of the original's path.
function ghostFrames(players: PitchPlayer[], selectedId: string): [number, number][] {
  const authored = players.find((p) => p.role === "ghost");
  const defaultOriginal = players.find((p) => p.role === "original");
  if (authored && defaultOriginal && selectedId === defaultOriginal.id) return authored.frames;
  const orig = players.find((p) => p.id === selectedId) ?? defaultOriginal;
  if (!orig) return authored?.frames ?? [[50, 34]];
  // Pull the path toward a more compact, goal-side position.
  return orig.frames.map(([x, y]) => [x - (x - 45) * 0.18, y - (y - 34) * 0.22]);
}
