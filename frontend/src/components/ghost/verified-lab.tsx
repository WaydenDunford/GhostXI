import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  GitCompare,
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useBackend } from "@/lib/backend-context";
import { ghostxi, sourceFrameAt } from "@/lib/ghostxi-api";
import type {
  Point,
  ReplacementCandidate,
  SavedSimulationScenario,
  VerifiedReplayPlayer,
  VerifiedSimulationResult,
} from "@/lib/backend/ghostxi";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataBadge, PageHeader, Panel } from "./ui";
import { SourcePitch } from "./source-pitch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RealMatchPanel } from "./real-match-panel";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// Accent-insensitive so typing "vinicius" finds "Vinícius Júnior".
const searchable = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function Picker({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || !options.length}>
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BackendGate({ children }: { children: ReactNode }) {
  const { catalog, detail, match } = useBackend();
  if (catalog.isPending)
    return (
      <Panel title="Connecting GhostXI">
        <p role="status">Loading the local match data…</p>
      </Panel>
    );
  if (catalog.data?.state !== "ok")
    return (
      <Panel title="GhostXI backend unavailable">
        <p role="alert" className="text-sm text-muted-foreground">
          {catalog.data?.state === "unavailable"
            ? catalog.data.reason
            : "The data service could not be reached."}
        </p>
        <p className="mt-2 text-sm">Start the local GhostXI app to load verified football data.</p>
        <Button className="mt-3" onClick={() => void catalog.refetch()}>
          Retry connection
        </Button>
      </Panel>
    );
  if (!catalog.data.matches.length) return <RealMatchPanel />;
  if (detail.error)
    return (
      <Panel title="Match could not load">
        <p role="alert">{detail.error.message}</p>
        <Button onClick={() => void detail.refetch()}>Retry match</Button>
      </Panel>
    );
  if (!match)
    return (
      <Panel title="Loading verified match">
        <p role="status">Reading the source roster and coverage…</p>
      </Panel>
    );
  return <>{children}</>;
}

export function VerifiedLab({ momentIndex }: { momentIndex?: number | undefined }) {
  const { matchId } = useBackend();
  return (
    <BackendGate>
      <ConnectedLab key={`${matchId}:${momentIndex ?? ""}`} momentIndex={momentIndex} />
    </BackendGate>
  );
}

type Swap = { originalPlayerId: string; candidatePlayerId: string };
export function replacementsOf(s: SavedSimulationScenario): Swap[] {
  return "replacements" in s
    ? s.replacements
    : [{ originalPlayerId: s.originalPlayerId, candidatePlayerId: s.candidatePlayerId }];
}

function ConnectedLab({ momentIndex }: { momentIndex?: number | undefined }) {
  const { match, matchId, setSelection } = useBackend();
  const queryClient = useQueryClient();
  const [playerId, setPlayerId] = useState(
    match!.players.find((p) => p.id === "Player2")?.id ??
      match!.coverage.segments[0]!.playerIds[0]!,
  );
  const [momentId, setMomentId] = useState("");
  const [rows, setRows] = useState<Swap[]>([]);
  const [result, setResult] = useState<VerifiedSimulationResult | null>(null);
  const [branchId, setBranchId] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [view, setView] = useState("original");
  const [labels, setLabels] = useState<"focus" | "all">("focus");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [poolSearch, setPoolSearch] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<
    { name: string; result: VerifiedSimulationResult }[]
  >([]);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const update = () => setIsFull(document.fullscreenElement === field.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const field = useRef<HTMLDivElement>(null);
  const moments = useQuery({
    queryKey: ["ghostxi", "moments", matchId, playerId],
    queryFn: () => ghostxi.getRecommendedMoments(matchId, { playerId, limit: 5 }),
  });
  const activeMoment =
    moments.data?.find((m) => m.id === momentId) ??
    moments.data?.[(momentIndex ?? 1) - 1] ??
    moments.data?.[0];
  const tracking = useQuery({
    queryKey: ["ghostxi", "tracking", matchId, activeMoment?.id],
    queryFn: () => ghostxi.getReplayTracking(matchId, { momentId: activeMoment!.id, limit: 2000 }),
    enabled: !!activeMoment,
  });
  const candidates = useQuery({
    queryKey: ["ghostxi", "candidates", matchId, playerId, activeMoment?.id],
    queryFn: () =>
      ghostxi.getReplacementCandidates({
        matchId,
        replacePlayerId: playerId,
        ...(activeMoment ? { momentId: activeMoment.id } : {}),
      }),
  });
  const saved = useQuery({
    queryKey: ["ghostxi", "scenarios", matchId],
    queryFn: () => ghostxi.listSavedScenarios({ matchId }),
  });
  const frames = tracking.data?.frames ?? [];
  const start = frames[0]?.periodTimeSec ?? 0;
  const duration = frames.length ? frames[frames.length - 1]!.periodTimeSec - start : 0;
  const source = sourceFrameAt(frames, start + time, match!.fps);
  const branch = result?.branches.find((b) => b.id === branchId) ?? result?.branches.at(-1);
  const alternative = branch ? sourceFrameAt(branch.frames, time, match!.fps) : null;
  const selected = match!.players.find((p) => p.id === playerId);
  const teamId = selected?.teamId;
  const candidateList = candidates.data ?? [];
  const candidate = candidateList.find((c) => c.id === candidateId) ?? candidateList[0];
  const names = Object.fromEntries(
    [...match!.players, ...candidateList].map((p) => [p.id, p.name]),
  );
  const clear = () => {
    setResult(null);
    setPlaying(false);
    setTime(0);
    setError("");
  };

  useEffect(() => {
    if (!playing || !duration) return;
    let handle = 0,
      last: number | undefined;
    const tick = (stamp: number) => {
      const delta = last === undefined ? 0 : ((stamp - last) / 1000) * Number(speed);
      last = stamp;
      setTime((t) => Math.min(duration, t + delta));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, duration]);
  useEffect(() => {
    if (duration && time >= duration) setPlaying(false);
  }, [time, duration]);

  const selectPlayer = (id: string) => {
    if (busy) return;
    setPlayerId(id);
    setRows([]);
    clear();
  };
  const changeMoment = (id: string) => {
    setMomentId(id);
    clear();
  };
  const refreshSaved = () => queryClient.invalidateQueries({ queryKey: ["ghostxi", "scenarios"] });
  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };
  const showSimulation = async (scenario: SavedSimulationScenario) => {
    const next = await ghostxi.simulateSavedScenario(scenario.id);
    setResult(next);
    setView("overlay");
    setBranchId(next.branches.at(-1)?.id ?? "");
    setTime(0);
    setSelection({ scenario, result: next });
    toast.success("Ghost simulation completed");
  };
  const create = async (simulate: boolean) => {
    const swaps = rows.length
      ? rows
      : candidate
        ? [{ originalPlayerId: playerId, candidatePlayerId: candidate.id }]
        : [];
    if (!activeMoment || !swaps.length || swaps.some((r) => !r.candidatePlayerId))
      throw new Error("Add a replacement and choose a candidate first.");
    const scenario = await ghostxi.createSavedScenario({
      sportId: "football",
      matchId,
      momentId: activeMoment.id,
      seed: 42,
      replacements: swaps,
    });
    await refreshSaved();
    if (simulate) await showSimulation(scenario);
    else toast.success("Scenario saved to GhostXI");
  };
  const addReplacement = (candidate?: ReplacementCandidate) => {
    const firstTeam = match!.players.find((p) => p.id === rows[0]?.originalPlayerId)?.teamId;
    const outgoing =
      !rows.some((r) => r.originalPlayerId === playerId) && (!firstTeam || firstTeam === teamId)
        ? selected
        : match!.players.find(
            (p) =>
              p.teamId === (firstTeam ?? teamId) && !rows.some((r) => r.originalPlayerId === p.id),
          );
    const incoming =
      candidate ?? candidateList.find((c) => !rows.some((r) => r.candidatePlayerId === c.id));
    if (!outgoing || !incoming || rows.length >= 4) return;
    setRows([...rows, { originalPlayerId: outgoing.id, candidatePlayerId: incoming.id }]);
    clear();
  };

  if (!match) return null;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void field.current?.requestFullscreen().catch((e) => setError(e.message));
  };
  const clock = source?.matchTimeSec ?? start + time + (frames[0]?.period === 2 ? 2700 : 0);
  const clockLabel = `${Math.floor(clock / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(clock % 60)
    .toString()
    .padStart(2, "0")}`;
  const chosen = rows[0]
    ? candidateList.find((c) => c.id === rows[0]!.candidatePlayerId)
    : candidate;
  const activeSwaps = result ? (branch?.replacements ?? []) : [];
  const drawField = (mode: "original" | "ghost" | "overlay", label: string) => (
    <SourcePitch
      match={match}
      source={source}
      alternative={alternative}
      sourceFrames={frames}
      alternativeFrames={branch?.frames ?? []}
      swaps={activeSwaps}
      names={names}
      selected={playerId}
      time={time}
      duration={duration}
      mode={mode}
      onSelect={selectPlayer}
      label={label}
      focus={labels === "focus"}
    />
  );
  const chooseCandidate = (id: string) => {
    setCandidateId(id);
    if (rows.length) setRows(rows.map((r, i) => (i === 0 ? { ...r, candidatePlayerId: id } : r)));
    clear();
  };
  const candidateRows = (sourceType: "bench" | "scouting") => (
    <ul className="mt-2 space-y-2">
      {candidateList
        .filter(
          (c) =>
            c.source === sourceType &&
            (positionFilter === "all" || c.position === positionFilter) &&
            (sourceType !== "scouting" ||
              searchable(`${c.name} ${c.team ?? ""}`).includes(searchable(poolSearch))),
        )
        .map((c) => (
          <li
            key={c.id}
            className={cn(
              "rounded-lg border bg-panel p-2.5 transition-colors hover:border-primary/50",
              chosen?.id === c.id && "border-ghost bg-ghost/5",
            )}
          >
            <button
              onClick={() => chooseCandidate(c.id)}
              disabled={busy}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="font-mono text-xs text-primary">{c.positionFit ?? "—"}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {c.position} · {c.team}
              </div>
            </button>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-ghost"
                  style={{ width: `${c.dataCoverage * 100}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">
                {Math.round(c.dataCoverage * 100)}%
              </span>
              <button
                aria-pressed={compareIds.includes(c.id)}
                onClick={() =>
                  setCompareIds((ids) =>
                    ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id],
                  )
                }
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                  compareIds.includes(c.id) ? "border-accent text-accent" : "text-muted-foreground",
                )}
              >
                Compare
              </button>
            </div>
          </li>
        ))}
      {!candidateList.some((c) => c.source === sourceType) && (
        <li className="py-3 text-xs text-muted-foreground">
          No verified bench records are available for this source match. Choose a candidate from the
          Talent Pool.
        </li>
      )}
    </ul>
  );
  const compareCandidates = async () => {
    const next: typeof comparisons = [];
    for (const id of compareIds) {
      const scenario = await ghostxi.createSavedScenario({
        sportId: "football",
        matchId,
        momentId: activeMoment!.id,
        seed: 42,
        replacements: [{ originalPlayerId: playerId, candidatePlayerId: id }],
      });
      const nextResult = await ghostxi.simulateSavedScenario(scenario.id);
      next.push({ name: names[id] ?? id, result: nextResult });
    }
    setComparisons(next);
    await refreshSaved();
  };
  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card shadow-panel">
        <summary className="cursor-pointer px-4 py-2.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Verified match catalog{" "}
          <span className="float-right font-mono text-[10px] text-success">
            Connected · {match.source.name}
          </span>
        </summary>
        <div className="p-4">
          <RealMatchPanel />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-panel">
        <span className="flex items-center gap-2 rounded bg-destructive/15 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-destructive">
          <span className={cn("size-1.5 rounded-full bg-destructive", playing && "animate-live")} />
          {playing ? "Live replay" : "Paused"}
        </span>
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-md bg-home font-display text-sm font-bold">
            {match.teams[0]?.name.slice(0, 3).toUpperCase()}
          </span>
          <span className="hidden font-semibold sm:inline">{match.teams[0]?.name}</span>
          <span
            className="rounded-md bg-background px-3 py-1 font-mono text-2xl font-bold tabular"
            title={
              match.score ? "Final score from source metadata" : "Score unavailable in the source"
            }
          >
            {match.score?.home ?? "—"}
            <span className="mx-2 text-muted-foreground">:</span>
            {match.score?.away ?? "—"}
          </span>
          <span className="hidden font-semibold sm:inline">{match.teams[1]?.name}</span>
          <span className="grid size-8 place-items-center rounded-md bg-away font-display text-sm font-bold">
            {match.teams[1]?.name.slice(0, 3).toUpperCase()}
          </span>
        </div>
        <span className="rounded-md bg-primary/15 px-2.5 py-1 font-mono text-lg text-primary tabular">
          {clockLabel}
        </span>
        <div className="ml-auto hidden items-center gap-5 text-xs md:flex">
          {[
            ["Tracking", `${match.fps} Hz`],
            ["Source windows", String(match.coverage.segments.length)],
            [
              "On pitch",
              String(frames[0] ? Object.values(frames[0].players).filter(Boolean).length : 22),
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-eyebrow">{k}</div>
              <div className="font-mono tabular">{v}</div>
            </div>
          ))}
        </div>
        <DataBadge kind={source?.dataStatus === "ESTIMATED" ? "estimated" : "observed"} />
      </div>
      {match.provider === "skillcorner" && (
        <p className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          {match.competition} · {match.season} · {match.date} · {match.venue} · Full-time score
          shown. Solid player outlines: detected; dashed outlines: source-extrapolated. Current
          frame: {String(source?.quality["detectedPlayers"] ?? "—")} detected,{" "}
          {String(source?.quality["extrapolatedPlayers"] ?? "—")} extrapolated; ball{" "}
          {source?.ballProvenance === "OBSERVED" ? "detected" : "extrapolated"}.
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)_310px]">
        <Panel title="Squad & Substitutions" className="order-2 xl:order-1">
          <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold">
                #
                {selected?.jerseyNumber ??
                  (match.provider === "metrica" ? playerId.replace("Player", "") : "—")}{" "}
                {selected?.name}
              </span>
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                {selected?.position ?? "Unknown role"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Observed source player · rating unavailable
            </p>
            <div className="mt-2 space-y-1.5">
              {["Passing", "Positioning", "Interceptions", "Shooting"].map((k) => (
                <div key={k} className="flex items-center gap-2 text-[10px]">
                  <span className="w-24 truncate text-muted-foreground">{k}</span>
                  <div className="h-1 flex-1 rounded-full bg-muted" />
                  <span className="w-6 text-right font-mono">—</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <Picker
              label="Squad team"
              value={teamId ?? ""}
              disabled={busy}
              onChange={(id) => selectPlayer(match.players.find((p) => p.teamId === id)!.id)}
              options={match.teams.map((t) => ({ id: t.id, label: t.name }))}
            />
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
                {match.players
                  .filter(
                    (p) =>
                      p.teamId === teamId &&
                      (frames[0]
                        ? frames[0].players[p.id] !== null
                        : match.coverage.segments[0]?.playerIds.includes(p.id)),
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        disabled={busy}
                        onClick={() => selectPlayer(p.id)}
                        aria-pressed={playerId === p.id}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                          playerId === p.id && "bg-accent/10 font-semibold text-accent",
                        )}
                      >
                        <span className="w-6 font-mono text-xs text-muted-foreground">
                          {p.jerseyNumber ??
                            (match.provider === "metrica" ? p.id.replace("Player", "") : "—")}
                        </span>
                        <span className="flex-1">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {p.position ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </TabsContent>
            {(["bench", "pool"] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-2">
                <Picker
                  label="Position filter"
                  value={positionFilter}
                  onChange={setPositionFilter}
                  options={[
                    { id: "all", label: "All positions" },
                    ...[...new Set(candidateList.map((c) => c.position))].map((p) => ({
                      id: p,
                      label: p,
                    })),
                  ]}
                />
                {tab === "pool" && (
                  <Input
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    placeholder="Search scouted player or country"
                    aria-label="Search scouted players"
                    className="mt-2 h-8 text-xs"
                  />
                )}
                {candidateRows(tab === "bench" ? "bench" : "scouting")}
              </TabsContent>
            ))}
          </Tabs>
        </Panel>
        <div className="order-1 min-w-0 space-y-4 xl:order-2">
          <div
            ref={field}
            className="flex flex-col overflow-hidden rounded-xl border bg-stands shadow-panel fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none fullscreen:border-0"
          >
            <div className="flex items-center justify-between px-5 pt-4 text-xs">
              <span className="text-eyebrow">
                {match.source.name} · Game {match.providerId}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded border border-border/60 bg-background/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {activeMoment?.title ?? "Source replay"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={toggleFullscreen}
                  aria-label={isFull ? "Exit fullscreen" : "Fullscreen pitch"}
                >
                  {isFull ? <Minimize /> : <Maximize />}
                </Button>
              </div>
            </div>
            {/* In fullscreen the pitch fits the remaining screen height, so the controls stay visible. */}
            <div className="flex flex-1 flex-col justify-center px-6 py-6 md:px-8 [:fullscreen_&]:min-h-0 [:fullscreen_&]:py-3 [:fullscreen_&_.stand-ring]:mx-auto [:fullscreen_&_.stand-ring]:max-h-[calc(100vh-10rem)] [:fullscreen_&_.stand-ring]:w-auto [:fullscreen_&_.stand-ring]:max-w-full">
              {view === "split" ? (
                <div className="grid gap-6 2xl:grid-cols-2 [:fullscreen_&]:grid-cols-2">
                  <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-warning">
                      Original · {selected?.name}
                    </p>
                    {drawField("original", "Historical source replay")}
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ghost">
                      Ghost · {chosen?.name ?? "—"}
                    </p>
                    {drawField("ghost", "Simulated alternative replay")}
                  </div>
                </div>
              ) : (
                drawField(
                  view as "original" | "ghost" | "overlay",
                  view === "ghost"
                    ? "Simulated alternative replay"
                    : view === "overlay" && result
                      ? "Ghost overlay comparison"
                      : "Historical source replay",
                )
              )}
            </div>
            <p className="px-5 pb-1 text-center text-[11px] text-muted-foreground">
              Click any highlighted player on the pitch to select them for substitution.
            </p>
            <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/60 px-4 py-3 backdrop-blur">
              <div className="flex gap-1.5">
                <Button
                  size="icon"
                  aria-label="Play"
                  disabled={playing || !duration}
                  onClick={() => {
                    if (time >= duration) setTime(0);
                    setPlaying(true);
                  }}
                >
                  <Play />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Pause"
                  disabled={!playing}
                  onClick={() => setPlaying(false)}
                >
                  <Pause />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Replay"
                  onClick={() => {
                    setTime(0);
                    setPlaying(true);
                  }}
                >
                  <RotateCcw />
                </Button>
              </div>
              <div className="w-20">
                <Picker
                  label="Playback speed"
                  value={speed}
                  onChange={setSpeed}
                  options={["0.5", "1", "2", "4"].map((id) => ({ id, label: `${id}×` }))}
                />
              </div>
              <input
                type="range"
                className="min-w-32 flex-1 accent-primary"
                aria-label="Scrub"
                min={0}
                max={duration || 8}
                step={0.04}
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
              />
              <Button
                size="icon"
                variant="secondary"
                aria-label={isFull ? "Exit fullscreen" : "Toggle fullscreen"}
                onClick={toggleFullscreen}
              >
                {isFull ? <Minimize /> : <Maximize />}
              </Button>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v)}
                variant="outline"
                size="sm"
              >
                {["original", "ghost", "split", "overlay"].map((v) => (
                  <ToggleGroupItem
                    key={v}
                    value={v}
                    disabled={v !== "original" && !result}
                    className="px-3 data-[state=on]:bg-ghost/20 data-[state=on]:text-ghost"
                  >
                    {v[0]!.toUpperCase() + v.slice(1)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                type="single"
                value={labels}
                onValueChange={(v) => v && setLabels(v as "focus" | "all")}
                variant="outline"
                size="sm"
                aria-label="Player labels"
              >
                <ToggleGroupItem
                  value="focus"
                  title="Name tags only for the compared, selected and on-ball players; others faded"
                  className="px-3 data-[state=on]:bg-ghost/20 data-[state=on]:text-ghost"
                >
                  Focus
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="all"
                  title="Name tags for all 22 players"
                  className="px-3 data-[state=on]:bg-ghost/20 data-[state=on]:text-ghost"
                >
                  All
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/40 px-4 py-2.5">
              <Button
                size="sm"
                className="shadow-glow"
                disabled={busy || !chosen || !frames.length}
                onClick={() => void runAction(() => create(true))}
              >
                <Zap />
                {busy ? "Simulating…" : "Run Ghost Simulation"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTime(0);
                  setPlaying(true);
                  setView("original");
                }}
              >
                Original Replay
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!result}
                onClick={() => {
                  setTime(0);
                  setPlaying(true);
                  setView("ghost");
                }}
              >
                Ghost Replay
              </Button>
              <Button size="sm" variant="outline" onClick={clear}>
                Reset
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !chosen}
                onClick={() => void runAction(() => create(false))}
              >
                <Save />
                Save Scenario
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !compareIds.length}
                title={
                  compareIds.length
                    ? undefined
                    : "Tag 2+ players with COMPARE in the Talent Pool to enable this"
                }
                onClick={() => void runAction(compareCandidates)}
              >
                <GitCompare />
                Compare Candidates{compareIds.length ? ` (${compareIds.length})` : ""}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 bg-background/40 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-home" />
                {match.teams[0]?.name.slice(0, 3).toUpperCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-away" />
                {match.teams[1]?.name.slice(0, 3).toUpperCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 border-warning" />
                Original
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2 border-dashed border-ghost" />
                Ghost
              </span>
              <span className="ml-auto flex gap-1.5">
                <DataBadge kind={source?.dataStatus === "ESTIMATED" ? "estimated" : "observed"} />
                {result && <DataBadge kind="simulated" />}
              </span>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {[tracking.error, moments.error, candidates.error, saved.error].map(
            (e, i) =>
              e && (
                <p key={i} role="alert" className="text-sm text-destructive">
                  {e.message}
                </p>
              ),
          )}
          <Panel
            title="Ghost Lineup Builder"
            action={
              <span className="font-mono text-[10px] text-ghost">
                {rows.length || 1} / 4 replacements
              </span>
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">
              {chosen
                ? `${selected?.name} → ${chosen.name}`
                : "Choose a candidate from the Talent Pool."}{" "}
              · Shared modeled movement assumptions.
            </p>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Picker
                    label={`Outgoing player ${i + 1}`}
                    value={r.originalPlayerId}
                    disabled={busy}
                    options={match.players
                      .filter(
                        (p) =>
                          p.teamId ===
                            match.players.find((p) => p.id === rows[0]?.originalPlayerId)?.teamId &&
                          !rows.some((r, j) => j !== i && r.originalPlayerId === p.id),
                      )
                      .map((p) => ({ id: p.id, label: p.name }))}
                    onChange={(id) => {
                      setRows(rows.map((r, j) => (j === i ? { ...r, originalPlayerId: id } : r)));
                      clear();
                    }}
                  />
                  <Picker
                    label={`Replacement candidate ${i + 1}`}
                    value={r.candidatePlayerId}
                    disabled={busy}
                    options={candidateList
                      .filter((c) => !rows.some((r, j) => j !== i && r.candidatePlayerId === c.id))
                      .map((c) => ({ id: c.id, label: c.name }))}
                    onChange={(id) => {
                      setRows(rows.map((r, j) => (j === i ? { ...r, candidatePlayerId: id } : r)));
                      clear();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove replacement ${i + 1}`}
                    disabled={busy}
                    onClick={() => {
                      setRows(rows.filter((_, j) => j !== i));
                      clear();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={busy || rows.length >= 4 || !candidateList.length}
              onClick={() => addReplacement(rows.length ? undefined : candidate)}
            >
              <Plus />
              Add replacement
            </Button>
            {result && (
              <div className="mt-3">
                <Picker
                  label="Alternative branch"
                  value={branch?.id ?? ""}
                  onChange={setBranchId}
                  options={result.branches.map((b) => ({
                    id: b.id,
                    label: b.id === "combined" ? "Combined · independent joint run" : b.id,
                  }))}
                />
              </div>
            )}
          </Panel>
          {comparisons.length > 0 && (
            <Panel title="Candidate comparison">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th>Candidate</th>
                    <th>Original</th>
                    <th>Alternative</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c) => (
                    <tr key={c.name} className="border-b">
                      <td className="py-2">{c.name}</td>
                      <td>{c.result.metrics.originalValue}</td>
                      <td>{c.result.metrics.alternativeValue}</td>
                      <td>{c.result.metrics.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          {result && <SimulationFindings result={result} />}
        </div>
        <div className="order-3 space-y-4">
          <Panel
            title={
              match.provider === "skillcorner"
                ? "Source actions to review"
                : "Recommended Moments to Test"
            }
            info="Moments are ranked using synchronized source events and tracking."
          >
            <p className="mb-3 text-xs text-muted-foreground">For {selected?.name}</p>
            <ul className="space-y-2">
              {moments.data?.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-lg border bg-panel p-3",
                    activeMoment?.id === m.id && "border-accent/50",
                  )}
                >
                  <div className="flex justify-between font-mono text-xs">
                    <span className="text-primary">
                      {Math.floor(m.timeSec / 60)}:
                      {String(Math.floor(m.timeSec % 60)).padStart(2, "0")}
                    </span>
                    <span className="text-muted-foreground">
                      {match.provider === "skillcorner" ? "EPV" : "Δ"}{" "}
                      {m.momentumDelta?.toFixed(3) ?? "Unavailable"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{m.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{m.description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    ▸ {m.relevanceReasons[0]}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <DataBadge kind={m.dataStatus} />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      cov {Math.round(m.dataCoverage * 100)}%
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    disabled={busy}
                    onClick={() => changeMoment(m.id)}
                  >
                    Test This Moment
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Ghost Profile">
            <p className="font-display text-lg font-bold text-ghost">
              {chosen?.name ?? "Select a candidate"}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {chosen?.position} · {chosen?.team}
            </p>
            <div className="space-y-2">
              {Object.entries(chosen?.attributes ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-mono">{v === null ? "—" : v.toFixed(3)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Profiles are separate from the recorded trajectories. Unmeasured physical traits
              remain unavailable.
            </p>
          </Panel>
        </div>
      </div>
      <Panel
        title={
          match.provider === "skillcorner"
            ? "Source action timeline"
            : "Match Timeline · Momentum Swings"
        }
      >
        <div className="flex flex-wrap gap-2">
          {moments.data?.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={activeMoment?.id === m.id ? "default" : "outline"}
              onClick={() => changeMoment(m.id)}
            >
              {Math.floor(m.timeSec / 60)}:{String(Math.floor(m.timeSec % 60)).padStart(2, "0")} ·{" "}
              {m.title}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {frames.length} source frames · {duration.toFixed(2)} s window ·{" "}
          {source
            ? `Period ${source.period} · source frame ${source.sourceFrame}`
            : "No observation"}{" "}
          · gaps remain unavailable
        </p>
      </Panel>
      <Panel title={`Saved Scenarios (${saved.data?.length ?? 0})`}>
        <div className="grid gap-2 md:grid-cols-2">
          {saved.data?.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-panel p-3"
            >
              <span className="min-w-0 flex-1 text-sm">
                {s.momentId} · {replacementsOf(s).length} replacement(s)
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    setMomentId(s.momentId);
                    setRows(replacementsOf(s));
                    setPlayerId(replacementsOf(s)[0]!.originalPlayerId);
                    await showSimulation(s);
                  })
                }
              >
                Open & run
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Duplicate ${s.id}`}
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await ghostxi.duplicateSavedScenario(s.id);
                    await refreshSaved();
                  })
                }
              >
                <Copy />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${s.id}`}
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await ghostxi.deleteSavedScenario(s.id);
                    await refreshSaved();
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        {!saved.data?.length && (
          <p className="text-sm text-muted-foreground">
            No saved scenarios yet. Configure a substitution and hit Save Scenario.
          </p>
        )}
      </Panel>
    </div>
  );
}

export function SimulationFindings({ result }: { result: VerifiedSimulationResult }) {
  return (
    <div className="space-y-4">
      <Panel title="Branch comparison" action={<DataBadge kind="simulated" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Branch</th>
                <th>Original proxy</th>
                <th>Alternative proxy</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {result.branches.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-2">{b.id}</td>
                  <td className="font-mono">{b.metrics.originalValue?.toFixed(3) ?? "—"}</td>
                  <td className="font-mono">{b.metrics.alternativeValue?.toFixed(3) ?? "—"}</td>
                  <td className="font-mono text-primary">{b.metrics.delta?.toFixed(3) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Geometric role proxy. Shared modeled physical parameters; low confidence. This does not
          estimate a score or win probability.
        </p>
      </Panel>
      <Panel title="Smart Coach findings">
        <ul className="space-y-3">
          {result.findings.map((f, i) => (
            <li key={i} className="rounded-md border p-3">
              <p className="text-xs uppercase text-primary">
                {f.branchId} · {f.metricId}
              </p>
              <p className="mt-1 text-sm">{f.interpretation}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.suggestedInvestigation}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Model evidence & limitations">
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {result.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
