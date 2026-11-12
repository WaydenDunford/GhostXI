import { FootballSurface, SimulationField, type FieldMode } from "./field";
import type { PitchPlayer } from "@/lib/mock-data";
import type {
  Point,
  ReplayMatch,
  VerifiedReplayPlayer,
  TrackingFrame,
  SimulationFrame,
} from "@/lib/backend/ghostxi";

type Swap = { originalPlayerId: string; candidatePlayerId: string };
type SourceMatch = ReplayMatch & { players: VerifiedReplayPlayer[] };
type P = [number, number];
export function SourcePitch({
  match,
  source,
  alternative,
  sourceFrames,
  alternativeFrames,
  swaps,
  names,
  selected,
  time,
  duration,
  mode,
  onSelect,
  label,
}: {
  match: SourceMatch;
  source: TrackingFrame | null;
  alternative: SimulationFrame | null;
  sourceFrames: TrackingFrame[];
  alternativeFrames: SimulationFrame[];
  swaps: Swap[];
  names: Record<string, string>;
  selected: string;
  time: number;
  duration: number;
  mode: FieldMode;
  onSelect: (id: string) => void;
  label: string;
}) {
  const convert = (p: Point | null | undefined): P | null => (p ? [p.x * 1.05, p.y * 0.68] : null);
  const start = sourceFrames[0]?.periodTimeSec ?? 0;
  const positions: Record<string, P | null> = {};
  for (const [id, point] of Object.entries(
    mode === "ghost" ? (alternative?.players ?? {}) : (source?.players ?? {}),
  ))
    positions[id] = convert(point);
  if (mode === "overlay")
    for (const swap of swaps)
      positions[swap.candidatePlayerId] = convert(alternative?.players[swap.candidatePlayerId]);
  const trails: Record<string, P[]> = {};
  for (const frame of sourceFrames) {
    if (frame.periodTimeSec > start + time + 1e-8) break;
    for (const [id, point] of Object.entries(frame.players)) {
      const p = convert(point);
      if (p) (trails[id] ??= []).push(p);
    }
    const b = convert(frame.ball);
    if (b) (trails["ball"] ??= []).push(b);
  }
  for (const frame of alternativeFrames) {
    if (frame.timeSec > time + 1e-8) break;
    for (const swap of swaps) {
      const p = convert(frame.players[swap.candidatePlayerId]);
      if (p) (trails[swap.candidatePlayerId] ??= []).push(p);
    }
  }
  const players: PitchPlayer[] = match.players.map((p) => ({
    id: p.id,
    num: Number(p.id.replace("Player", "")) || match.players.indexOf(p) + 1,
    label: p.name,
    team: p.teamId === match.teams[0]?.id ? "home" : "away",
    frames: [],
    ...(swaps.some((r) => r.originalPlayerId === p.id)
      ? { role: "original" as const, pairId: p.id }
      : {}),
  }));
  for (const swap of swaps) {
    const original = players.find((p) => p.id === swap.originalPlayerId);
    if (original)
      players.push({
        ...original,
        id: swap.candidatePlayerId,
        label: names[swap.candidatePlayerId] ?? "Ghost",
        role: "ghost",
        pairId: original.id,
      });
  }
  const frame = mode === "ghost" ? alternative : source;
  return (
    <SimulationField
      t={duration ? time / duration : 0}
      mode={mode}
      surface={<FootballSurface />}
      players={players}
      ballFrames={{ original: [], ghost: [] }}
      sourceFrame={frame ? { players: positions, ball: convert(frame.ball) } : null}
      sourceTrails={trails}
      accessibleLabel={label}
      showLabels
      className="stand-ring rounded-md"
      selectedId={selected}
      onPlayerClick={(id) =>
        onSelect(swaps.find((r) => r.candidatePlayerId === id)?.originalPlayerId ?? id)
      }
    />
  );
}
