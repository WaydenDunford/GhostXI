// Football pitch: generic SimulationField + football surface + exposed-channel overlay.
import { ballFrames, pitchPlayers } from "@/lib/mock-data";
import { FootballSurface, SimulationField, type FieldMode } from "./field";

export type PitchMode = FieldMode;

export function Pitch({
  t,
  mode,
  showLabels = true,
  className,
  onPlayerClick,
  selectedId,
}: {
  t: number;
  mode: PitchMode;
  showLabels?: boolean | undefined;
  className?: string | undefined;
  onPlayerClick?: ((id: string) => void) | undefined;
  selectedId?: string | undefined;
}) {
  const showOriginal = mode !== "ghost";
  return (
    <SimulationField
      t={t}
      mode={mode}
      showLabels={showLabels}
      className={className}
      surface={<FootballSurface />}
      players={pitchPlayers}
      ballFrames={ballFrames}
      onPlayerClick={onPlayerClick}
      selectedId={selectedId}
      overlay={
        showOriginal && t > 0.35 ? (
          <g opacity={Math.min(1, (t - 0.35) * 3)}>
            <rect
              x="30"
              y="49"
              width="30"
              height="17"
              rx="1.5"
              className="fill-destructive/15 stroke-destructive/70"
              strokeWidth="0.2"
              strokeDasharray="1 0.6"
            />
            <text x="31" y="51.4" className="fill-destructive font-mono" fontSize="1.4">
              EXPOSED CHANNEL · 18m
            </text>
          </g>
        ) : null
      }
    />
  );
}
