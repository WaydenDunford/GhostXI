import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GhostMomentumComparison } from "@/lib/backend/ghostxi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataBadge, Panel } from "./ui";

const signed = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}`;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export function GhostMomentum({
  comparison,
  branchId,
  onBranchChange,
  playbackTimeSec,
}: {
  comparison?: GhostMomentumComparison | undefined;
  branchId?: string | undefined;
  onBranchChange?: ((id: string) => void) | undefined;
  playbackTimeSec?: number | undefined;
}) {
  const branch =
    comparison?.branches.find((item) => item.branchId === branchId) ?? comparison?.branches.at(-1);
  if (!comparison || !branch)
    return (
      <Panel title="Ghost momentum impact">
        <p className="text-sm text-muted-foreground">
          Run a ghost simulation in Match Lab to compare momentum from the original and replacement
          paths.
        </p>
      </Panel>
    );
  const points = branch.points.map((point) => ({
    ...point,
    original: point.original * 100,
    ghost: point.ghost * 100,
    delta: point.delta * 100,
  }));
  const current =
    playbackTimeSec === undefined
      ? undefined
      : [...branch.points].reverse().find((point) => point.timeSec <= playbackTimeSec + 1e-8);
  return (
    <Panel title="Ghost momentum impact" action={<DataBadge kind="simulated" />}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>Original paths vs ghost paths · local spatial momentum</p>
          <p className="mt-1">
            Period {comparison.window.period} · {clock(comparison.window.startMatchTimeSec)}–
            {clock(comparison.window.startMatchTimeSec + comparison.window.durationSec)} ·{" "}
            {comparison.window.durationSec.toFixed(1)} seconds
          </p>
          <p className="mt-1">
            Positive favors {comparison.homeTeam.name}; negative favors {comparison.awayTeam.name}.
          </p>
        </div>
        {onBranchChange && (
          <Select value={branch.branchId} onValueChange={onBranchChange}>
            <SelectTrigger aria-label="Momentum branch" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {comparison.branches.map((item) => (
                <SelectItem key={item.branchId} value={item.branchId}>
                  {item.branchId === "combined" ? "Combined replacements" : item.branchId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Original mean", signed(branch.summary.originalMean)],
          ["Ghost mean", signed(branch.summary.ghostMean)],
          ["Mean change", `${signed(branch.summary.delta)} pts`],
          ["Largest change", `${signed(branch.summary.peakDelta)} pts`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
              className="mt-1 font-mono text-lg font-semibold"
              data-testid={`momentum-${label?.toLowerCase().replaceAll(" ", "-")}`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      {current && (
        <p className="mb-2 text-xs" aria-live="off">
          Replay {playbackTimeSec!.toFixed(1)}s · current change {signed(current.delta)} pts
        </p>
      )}
      <div
        className="h-64 w-full min-w-0"
        role="img"
        aria-label={`Original and ghost spatial momentum for ${branch.branchId}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="timeSec"
              type="number"
              domain={[0, comparison.window.durationSec]}
              tickFormatter={(value: number) => `${value.toFixed(1)}s`}
              fontSize={11}
              stroke="var(--muted-foreground)"
            />
            <YAxis domain={[-100, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelFormatter={(value) => `Replay ${Number(value).toFixed(2)}s`}
              formatter={(value) => `${Number(value).toFixed(2)} pts`}
            />
            <Legend />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" />
            {playbackTimeSec !== undefined && (
              <ReferenceLine
                x={Math.min(comparison.window.durationSec, Math.max(0, playbackTimeSec))}
                stroke="var(--accent)"
                strokeDasharray="3 3"
              />
            )}
            <Line
              name="Original paths"
              dataKey="original"
              type="linear"
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              name="Ghost paths"
              dataKey="ghost"
              type="linear"
              stroke="var(--ghost)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Calculated from player distance to the ball, using the same model for both paths. This is a
        modeled effect within this clip; recorded match events and xG remain separate.
      </p>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Method and momentum values</summary>
        <p className="my-2">{comparison.methodology}</p>
        <ul className="mb-3 list-disc space-y-1 pl-4">
          {comparison.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left font-mono">
            <caption className="mb-2 text-left font-sans">
              {branch.branchId} · spatial momentum points
            </caption>
            <thead>
              <tr>
                <th>Replay time</th>
                <th>Original</th>
                <th>Ghost</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {branch.points.map((point) => (
                <tr key={point.timeSec}>
                  <td>{point.timeSec.toFixed(2)}s</td>
                  <td>{signed(point.original)}</td>
                  <td>{signed(point.ghost)}</td>
                  <td>{signed(point.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}
