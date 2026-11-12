import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Maximize, Pause, Play } from "lucide-react";
import { useBackend } from "@/lib/backend-context";
import { SimulationField, FootballSurface } from "./field";
import { Panel, DataBadge, PageHeader } from "./ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function EventMatchLab() {
  const b = useBackend();
  const match = b.eventMatch.data!;
  const roster = b.eventPlayers.data!;
  const events = b.eventActions.data!;
  const [team, setTeam] = useState("all");
  const [type, setType] = useState("all");
  const [player, setPlayer] = useState("all");
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      events.findIndex((e) => e.id === match.keyMoments[0]?.eventId),
    ),
  );
  const [playing, setPlaying] = useState(false);
  const stadium = useRef<HTMLDivElement>(null);
  const { moment } = useSearch({ from: "/match-lab" });
  const actions = useMemo(
    () =>
      events.filter(
        (e) =>
          (team === "all" || String(e.teamId) === team) &&
          (type === "all" || e.type === type) &&
          (player === "all" || String(e.playerId) === player),
      ),
    [events, team, type, player],
  );
  const activeIndex = Math.min(index, Math.max(0, actions.length - 1));
  const event = actions[activeIndex];
  useEffect(() => {
    if (!moment) return;
    const id = match.keyMoments[moment - 1]?.eventId;
    const i = actions.findIndex((e) => e.id === id);
    if (i >= 0) setIndex(i);
  }, [moment, match.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setIndex((i) => {
          if (i >= actions.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      900,
    );
    return () => window.clearInterval(timer);
  }, [playing, actions.length]);
  const change = (fn: (v: string) => void) => (value: string) => {
    fn(value);
    setIndex(0);
    setPlaying(false);
  };
  const actor = roster.find((p) => p.providerId === event?.playerId);
  const end = event?.pass?.endLocation ?? event?.carry?.endLocation ?? event?.shot?.endLocation;
  const point = event?.location;
  const jump = (id: string) => {
    setTeam("all");
    setType("all");
    setPlayer("all");
    setPlaying(false);
    setIndex(
      Math.max(
        0,
        events.findIndex((e) => e.id === id),
      ),
    );
  };
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${match.competition} · ${match.season} · ${match.date}`}
        title="Match Lab"
      >
        <DataBadge kind="observed" />
      </PageHeader>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">
              {match.home.name}{" "}
              <span className="font-mono text-primary">
                {match.home.score}–{match.away.score}
              </span>{" "}
              {match.away.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Full time · {match.date} · {match.stadium ?? "Venue unavailable"}
            </p>
          </div>
          <div className="flex gap-6 font-mono text-sm">
            <span>
              xG{" "}
              <b>
                {b.eventMomentum.data!.totals.homeXG.toFixed(2)}–
                {b.eventMomentum.data!.totals.awayXG.toFixed(2)}
              </b>
            </span>
            <span>{events.length} events</span>
          </div>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[230px_minmax(0,1fr)_270px]">
        <Panel title="Recorded match squads">
          <div className="max-h-[650px] space-y-4 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            {[match.home, match.away].map((t) => (
              <div key={t.id}>
                <h3 className="mb-2 font-semibold">{t.name}</h3>
                {roster
                  .filter((p) => p.teamId === t.id)
                  .sort(
                    (a, b) =>
                      Number(b.starter) - Number(a.starter) ||
                      (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setTeam("all");
                        setType("all");
                        change(setPlayer)(String(p.providerId));
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-muted",
                        player === String(p.providerId) && "bg-primary/10 text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full font-mono text-white",
                          t.id === match.home.id ? "bg-blue-500" : "bg-red-500",
                        )}
                      >
                        {p.jerseyNumber ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        {p.name}
                        <span className="block text-[10px] text-muted-foreground">
                          {p.starter ? "Starting XI" : "Bench"} ·{" "}
                          {p.positions[0] ?? "Position unavailable"}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </Panel>
        <div className="min-w-0 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={team} onValueChange={change(setTeam)}>
              <SelectTrigger aria-label="Filter event team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both teams</SelectItem>
                {[match.home, match.away].map((t) => (
                  <SelectItem value={String(t.id)} key={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={change(setType)}>
              <SelectTrigger aria-label="Filter action type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All action types</SelectItem>
                {[...new Set(events.filter((e) => e.location).map((e) => e.type))]
                  .sort()
                  .map((t) => (
                    <SelectItem value={t} key={t}>
                      {t}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setTeam("all");
                setType("all");
                setPlayer("all");
                setIndex(0);
                setPlaying(false);
              }}
            >
              Reset filters
            </Button>
          </div>
          <div ref={stadium} className="rounded-2xl border bg-background bg-stands p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-2 font-mono text-xs text-muted-foreground">
              <span>
                {event
                  ? `${event.minute}:${String(event.second).padStart(2, "0")} · P${event.period} · ${event.teamName}`
                  : "No located actions"}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fullscreen pitch"
                onClick={() => void stadium.current?.requestFullscreen()}
              >
                <Maximize />
              </Button>
            </div>
            <div className="overflow-hidden rounded-xl border bg-background/80 p-2">
              <SimulationField
                surface={<FootballSurface />}
                mode="original"
                t={0}
                players={
                  point && actor
                    ? [
                        {
                          id: actor.id,
                          num: actor.jerseyNumber ?? 0,
                          label: actor.name,
                          team: actor.teamId === match.home.id ? "home" : "away",
                          frames: [],
                        },
                      ]
                    : []
                }
                ballFrames={{ original: [], ghost: [] }}
                sourceFrame={{
                  players: point && actor ? { [actor.id]: [point.x, point.y] } : {},
                  ball: point ? [point.x, point.y] : null,
                }}
                accessibleLabel={
                  event
                    ? `Recorded ${event.type} by ${event.playerName ?? event.teamName} at ${event.minute}:${event.second}. Other player positions unavailable.`
                    : "No recorded location"
                }
                overlay={
                  point && end ? (
                    <g>
                      <defs>
                        <marker
                          id="actionArrow"
                          markerWidth="4"
                          markerHeight="4"
                          refX="3"
                          refY="2"
                          orient="auto"
                        >
                          <path d="M0 0L4 2L0 4" fill="var(--primary)" />
                        </marker>
                      </defs>
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="var(--primary)"
                        strokeWidth="0.5"
                        strokeDasharray={event?.pass?.completed === false ? "1 1" : undefined}
                        markerEnd="url(#actionArrow)"
                      />
                    </g>
                  ) : undefined
                }
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label="Previous event"
                disabled={!actions.length || activeIndex === 0}
                onClick={() => setIndex(activeIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon"
                aria-label={playing ? "Pause events" : "Play events"}
                disabled={!actions.length}
                onClick={() => {
                  if (activeIndex === actions.length - 1) setIndex(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Next event"
                disabled={!actions.length || activeIndex === actions.length - 1}
                onClick={() => setIndex(activeIndex + 1)}
              >
                <ChevronRight />
              </Button>
              <input
                type="range"
                aria-label="Recorded event sequence"
                className="min-w-0 flex-1 accent-primary"
                min={0}
                max={Math.max(0, actions.length - 1)}
                value={activeIndex}
                disabled={!actions.length}
                onChange={(e) => {
                  setPlaying(false);
                  setIndex(Number(e.target.value));
                }}
              />
              <span className="font-mono text-xs">
                {actions.length ? activeIndex + 1 : 0}/{actions.length}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Recorded action locations · each team attacks to the right. Playback steps through
            events; other players’ positions are unavailable. Choose Tracking replays for available
            22-player movement windows and ghost simulations.
          </p>
          <Panel
            title={
              event
                ? `${event.type} · ${event.playerName ?? event.teamName}`
                : "No events match these filters"
            }
          >
            {event && (
              <div className="space-y-2 text-sm">
                <p>
                  {event.teamName} · {event.minute}:{String(event.second).padStart(2, "0")} ·{" "}
                  {event.positionName ?? "Position unavailable"}
                </p>
                <p>
                  {event.shot
                    ? `${event.shot.outcome} · xG ${event.shot.xg?.toFixed(3) ?? "Unavailable"}`
                    : event.pass
                      ? `${event.pass.outcome} · to ${roster.find((p) => p.providerId === event.pass?.recipientId)?.name ?? "recipient unavailable"}`
                      : event.type}
                </p>
                <p className="break-all font-mono text-[10px] text-muted-foreground">
                  Source event: {event.id}
                </p>
              </div>
            )}
          </Panel>
        </div>
        <Panel title="Key match moments">
          <div className="space-y-2">
            {match.keyMoments.map((m) => (
              <button
                key={m.eventId}
                className={cn(
                  "w-full rounded-lg border p-3 text-left hover:bg-muted",
                  event?.id === m.eventId && "border-primary bg-primary/10",
                )}
                onClick={() => jump(m.eventId)}
              >
                <span className="font-mono text-xs text-primary">
                  {m.minute}:{String(m.second).padStart(2, "0")} · {m.outcome ?? m.type}
                </span>
                <span className="block text-sm font-semibold">{m.playerName ?? m.teamName}</span>
                <span className="text-xs text-muted-foreground">
                  {m.teamName}
                  {m.xg !== null ? ` · xG ${m.xg.toFixed(3)}` : ""}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        <img className="h-8 w-auto" src="/api/v1/datasets/statsbomb/logo" alt="StatsBomb" />
        <span>
          Data: StatsBomb Open Data · Match {match.providerId} · {match.date}
        </span>
        <a
          className="text-primary underline"
          href={match.source.url}
          target="_blank"
          rel="noreferrer"
        >
          View source
        </a>
      </div>
    </div>
  );
}
