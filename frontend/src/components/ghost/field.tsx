// Generic 2D simulation field: shared player/ball rendering + per-sport surfaces.
// All surfaces use a normalized 105x68 frame (viewBox "-4 -4 113 76").
import type { ReactNode } from "react";
import type { PitchPlayer } from "@/lib/mock-data";
import type { SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";

export type FieldMode = "original" | "ghost" | "overlay";
type P = [number, number];

function lerp(frames: P[], t: number): P {
  const max = frames.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * max;
  const i = Math.min(Math.floor(x), max - 1);
  const k = x - i;
  const e = k * k * (3 - 2 * k);
  const a = frames[i]!,
    b = frames[i + 1]!;
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}
function trail(frames: P[], t: number) {
  const pts: P[] = [];
  for (let s = 0; s <= 24; s++) {
    const u = (s / 24) * t;
    pts.push(lerp(frames, u));
  }
  return pts.map((p) => p.join(",")).join(" ");
}

// ------------------------------------------------------------ Sport surfaces
export function FootballSurface() {
  return (
    <>
      <rect x="-4" y="-4" width="113" height="76" rx="1.5" className="fill-pitch" />
      {Array.from(
        { length: 12 },
        (_, i) =>
          i % 2 === 0 && (
            <rect
              key={i}
              x={i * 8.75}
              y="0"
              width="8.75"
              height="68"
              className="fill-pitch-stripe"
            />
          ),
      )}
      <rect x="-4" y="-4" width="113" height="76" fill="url(#pitchLight)" />
      <g className="fill-none stroke-pitch-line" strokeWidth="0.25">
        <rect x="0" y="0" width="105" height="68" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3" />
        <path d="M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3" />
        <path d="M0 1A1 1 0 0 0 1 0M104 0A1 1 0 0 0 105 1M105 67A1 1 0 0 0 104 68M1 68A1 1 0 0 0 0 67" />
      </g>
      <rect
        x="-2"
        y="30.34"
        width="2"
        height="7.32"
        fill="url(#net)"
        className="stroke-pitch-line"
        strokeWidth="0.2"
      />
      <rect
        x="105"
        y="30.34"
        width="2"
        height="7.32"
        fill="url(#net)"
        className="stroke-pitch-line"
        strokeWidth="0.2"
      />
      {[
        [52.5, 34],
        [11, 34],
        [94, 34],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="0.35" className="fill-pitch-line" />
      ))}
      <g className="stroke-pitch-line/20" strokeWidth="0.15" strokeDasharray="0.8 1.2">
        <line x1="0" y1="22.67" x2="105" y2="22.67" />
        <line x1="0" y1="45.33" x2="105" y2="45.33" />
      </g>
    </>
  );
}

export function BasketballSurface() {
  return (
    <>
      <rect x="-4" y="-4" width="113" height="76" rx="1.5" className="fill-wood" />
      {Array.from({ length: 14 }, (_, i) => (
        <line
          key={i}
          x1={i * 8.75}
          y1="0"
          x2={i * 8.75}
          y2="68"
          className="stroke-wood-line/10"
          strokeWidth="0.3"
        />
      ))}
      <rect x="-4" y="-4" width="113" height="76" fill="url(#pitchLight)" />
      <g className="fill-none stroke-wood-line" strokeWidth="0.25">
        <rect x="0" y="0" width="105" height="68" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="6" />
        {/* Paint + free-throw */}
        <rect x="0" y="22.6" width="19" height="22.8" />
        <rect x="86" y="22.6" width="19" height="22.8" />
        <circle cx="19" cy="34" r="6" />
        <circle cx="86" cy="34" r="6" />
        {/* Three-point lines: corners + arc */}
        <path d="M0 3 L6.75 3 A23.75 23.75 0 0 1 6.75 65 L0 65" />
        <path d="M105 3 L98.25 3 A23.75 23.75 0 0 0 98.25 65 L105 65" />
        {/* Baskets */}
        <circle cx="5.25" cy="34" r="0.75" />
        <circle cx="99.75" cy="34" r="0.75" />
        <line x1="4" y1="31" x2="4" y2="37" strokeWidth="0.4" />
        <line x1="101" y1="31" x2="101" y2="37" strokeWidth="0.4" />
      </g>
      <rect x="0" y="22.6" width="19" height="22.8" className="fill-wood-line/10" />
      <rect x="86" y="22.6" width="19" height="22.8" className="fill-wood-line/10" />
    </>
  );
}

export function HockeySurface() {
  return (
    <>
      <rect x="-4" y="-4" width="113" height="76" rx="6" className="fill-ice" />
      <rect x="-4" y="-4" width="113" height="76" fill="url(#pitchLight)" />
      <g className="fill-none" strokeWidth="0.3">
        <rect x="0" y="0" width="105" height="68" rx="8" className="stroke-ice-line" />
        {/* Center red line + blue lines */}
        <line
          x1="52.5"
          y1="0"
          x2="52.5"
          y2="68"
          className="stroke-destructive/70"
          strokeWidth="0.5"
        />
        <line x1="26.25" y1="0" x2="26.25" y2="68" className="stroke-accent" strokeWidth="0.8" />
        <line x1="78.75" y1="0" x2="78.75" y2="68" className="stroke-accent" strokeWidth="0.8" />
        {/* Goal lines */}
        <line x1="4" y1="0" x2="4" y2="68" className="stroke-destructive/50" strokeWidth="0.2" />
        <line
          x1="101"
          y1="0"
          x2="101"
          y2="68"
          className="stroke-destructive/50"
          strokeWidth="0.2"
        />
        {/* Faceoff circles + spots */}
        <circle cx="52.5" cy="34" r="4.5" className="stroke-accent/70" strokeWidth="0.2" />
        {[
          [17, 14],
          [17, 54],
          [88, 14],
          [88, 54],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="4.5" className="stroke-destructive/60" strokeWidth="0.2" />
            <circle cx={x} cy={y} r="0.4" className="fill-destructive/70 stroke-none" />
          </g>
        ))}
        <circle cx="52.5" cy="34" r="0.4" className="fill-accent stroke-none" />
        {/* Goal creases + goals */}
        <path
          d="M4 29 A5 5 0 0 1 4 39"
          className="stroke-accent/70 fill-accent/15"
          strokeWidth="0.2"
        />
        <path
          d="M101 29 A5 5 0 0 0 101 39"
          className="stroke-accent/70 fill-accent/15"
          strokeWidth="0.2"
        />
        <rect
          x="2.4"
          y="31"
          width="1.6"
          height="6"
          className="stroke-destructive"
          strokeWidth="0.25"
        />
        <rect
          x="101"
          y="31"
          width="1.6"
          height="6"
          className="stroke-destructive"
          strokeWidth="0.25"
        />
      </g>
    </>
  );
}

export function HandballSurface() {
  return (
    <>
      <rect x="-4" y="-4" width="113" height="76" rx="1.5" className="fill-hcourt" />
      {Array.from(
        { length: 14 },
        (_, i) =>
          i % 2 === 0 && (
            <rect
              key={i}
              x={i * 8.75}
              y="0"
              width="8.75"
              height="68"
              className="fill-hcourt-line/5"
            />
          ),
      )}
      <rect x="-4" y="-4" width="113" height="76" fill="url(#pitchLight)" />
      <g className="fill-none stroke-hcourt-line" strokeWidth="0.25">
        <rect x="0" y="0" width="105" height="68" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" strokeDasharray="1.5 1" />
        {/* 6m goal areas (solid) */}
        <path d="M0 25.2 L6 25.2 A6 6 0 0 1 6 42.8 L0 42.8" />
        <path d="M105 25.2 L99 25.2 A6 6 0 0 0 99 42.8 L105 42.8" />
        {/* 9m free-throw lines (dashed) */}
        <path d="M0 20.4 L9 20.4 A9 9 0 0 1 9 47.6 L0 47.6" strokeDasharray="1.2 0.8" />
        <path d="M105 20.4 L96 20.4 A9 9 0 0 0 96 47.6 L105 47.6" strokeDasharray="1.2 0.8" />
        {/* 7m penalty marks + 4m GK marks */}
        <line x1="7" y1="33.4" x2="7" y2="34.6" strokeWidth="0.5" />
        <line x1="98" y1="33.4" x2="98" y2="34.6" strokeWidth="0.5" />
        <line x1="4" y1="33.6" x2="4" y2="34.4" strokeWidth="0.4" />
        <line x1="101" y1="33.6" x2="101" y2="34.4" strokeWidth="0.4" />
      </g>
      {/* Goals */}
      <rect
        x="-1.5"
        y="30.5"
        width="1.5"
        height="7"
        fill="url(#net)"
        className="stroke-hcourt-line"
        strokeWidth="0.2"
      />
      <rect
        x="105"
        y="30.5"
        width="1.5"
        height="7"
        fill="url(#net)"
        className="stroke-hcourt-line"
        strokeWidth="0.2"
      />
      {/* Goal-area fill */}
      <path d="M0 25.2 L6 25.2 A6 6 0 0 1 6 42.8 L0 42.8 Z" className="fill-hcourt-line/15" />
      <path d="M105 25.2 L99 25.2 A6 6 0 0 0 99 42.8 L105 42.8 Z" className="fill-hcourt-line/15" />
    </>
  );
}

export function VolleyballSurface() {
  return (
    <>
      <rect x="-4" y="-4" width="113" height="76" rx="1.5" className="fill-vcourt" />
      <rect x="-4" y="-4" width="113" height="76" fill="url(#pitchLight)" />
      {/* Playing court: 18x9m mapped to 105x68 with margins */}
      <g className="fill-none stroke-vcourt-line" strokeWidth="0.25">
        <rect x="7.5" y="2" width="90" height="64" />
        {/* Attack (3m) lines */}
        <line x1="37.5" y1="2" x2="37.5" y2="66" />
        <line x1="67.5" y1="2" x2="67.5" y2="66" />
        {/* Service zone marks */}
        <line x1="7.5" y1="68" x2="7.5" y2="70" />
        <line x1="97.5" y1="68" x2="97.5" y2="70" />
      </g>
      {/* Front zones tinted */}
      <rect x="37.5" y="2" width="15" height="64" className="fill-vcourt-line/10" />
      <rect x="52.5" y="2" width="15" height="64" className="fill-vcourt-line/10" />
      {/* Net */}
      <line
        x1="52.5"
        y1="-2"
        x2="52.5"
        y2="70"
        className="stroke-foreground/80"
        strokeWidth="0.6"
      />
      <line
        x1="52.5"
        y1="-2"
        x2="52.5"
        y2="70"
        className="stroke-foreground/40"
        strokeWidth="1.4"
        strokeDasharray="0.4 1.2"
      />
      <circle cx="52.5" cy="-2" r="0.6" className="fill-destructive" />
      <circle cx="52.5" cy="70" r="0.6" className="fill-destructive" />
    </>
  );
}

export function SportSurface({ sport }: { sport: SportId }) {
  switch (sport) {
    case "basketball":
      return <BasketballSurface />;
    case "hockey":
      return <HockeySurface />;
    case "handball":
      return <HandballSurface />;
    case "volleyball":
      return <VolleyballSurface />;
    default:
      return <FootballSurface />;
  }
}

// ------------------------------------------------------------ Generic field
export function SimulationField({
  t,
  mode,
  showLabels = true,
  className,
  surface,
  players,
  ballFrames,
  ballClassName,
  overlay,
  onPlayerClick,
  selectedId,
  sourceFrame,
  sourceTrails,
  accessibleLabel = "Tactical field view",
}: {
  t: number;
  mode: FieldMode;
  showLabels?: boolean | undefined;
  className?: string | undefined;
  surface: ReactNode;
  players: PitchPlayer[];
  ballFrames: { original: P[]; ghost: P[] };
  ballClassName?: string | undefined;
  overlay?: ReactNode;
  onPlayerClick?: ((id: string) => void) | undefined;
  selectedId?: string | undefined;
  sourceFrame?: { players: Record<string, P | null>; ball: P | null } | null;
  sourceTrails?: Record<string, P[]>;
  accessibleLabel?: string;
}) {
  const showGhost = mode !== "original";
  const showOriginal = mode !== "ghost";
  const ballPath = mode === "ghost" ? ballFrames.ghost : ballFrames.original;
  const position = (p: PitchPlayer): P | null =>
    sourceFrame !== undefined ? (sourceFrame?.players[p.id] ?? null) : lerp(p.frames, t);
  const pathFor = (p: PitchPlayer) =>
    sourceFrame !== undefined
      ? (sourceTrails?.[p.id] ?? []).map((p) => p.join(",")).join(" ")
      : trail(p.frames, t);
  const ball = sourceFrame !== undefined ? (sourceFrame?.ball ?? null) : lerp(ballPath, t);
  const ghostBall =
    sourceFrame === undefined && mode === "overlay" ? lerp(ballFrames.ghost, t) : null;
  const origs = players.filter((p) => p.role === "original");
  const ghs = players.filter((p) => p.role === "ghost");
  // Ghost/original pairs: matched by pairId when present, else by index.
  const pairs = ghs
    .map((g, i) => {
      const o = origs.find((x) => x.pairId === g.pairId) ?? origs[i];
      const gp = position(g),
        op = o ? position(o) : null;
      return o && gp && op ? { g, o, gp, op } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const carrier = players
    .filter((p) => !p.role)
    .reduce(
      (best, p) => {
        const point = position(p);
        if (!point || !ball) return best;
        const [x, y] = point;
        const d = Math.hypot(x - ball[0], y - ball[1]);
        return d < best.d ? { id: p.id, d } : best;
      },
      { id: "", d: 99 },
    );

  return (
    <svg
      viewBox="-4 -4 113 76"
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={accessibleLabel}
    >
      <defs>
        <radialGradient id="pitchLight" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="black" stopOpacity="0.35" />
        </radialGradient>
        <pattern id="net" width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <path d="M0 0L0.6 0.6M0.6 0L0 0.6" className="stroke-pitch-line" strokeWidth="0.06" />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="shadow">
          <feDropShadow dx="0.25" dy="0.4" stdDeviation="0.3" floodOpacity="0.55" />
        </filter>
        <marker
          id="arrow"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="3"
          markerHeight="3"
          orient="auto"
        >
          <path d="M0 0L6 3L0 6z" className="fill-foreground/70" />
        </marker>
        <marker
          id="arrowG"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="3"
          markerHeight="3"
          orient="auto"
        >
          <path d="M0 0L6 3L0 6z" className="fill-ghost" />
        </marker>
      </defs>

      {surface}

      {/* Ghost positioning indicators */}
      {showGhost &&
        t > 0.35 &&
        pairs.map(({ g, gp }) => (
          <g key={`ind-${g.id}`} opacity={Math.min(1, (t - 0.35) * 3)}>
            <circle
              cx={gp[0]}
              cy={gp[1]}
              r="6"
              className="fill-ghost/5 stroke-ghost/40"
              strokeWidth="0.15"
            />
          </g>
        ))}

      {/* Movement trails */}
      {showOriginal &&
        origs.map((o) => (
          <polyline
            key={`tr-${o.id}`}
            points={pathFor(o)}
            className="fill-none stroke-warning/80"
            strokeWidth="0.35"
            strokeDasharray="0.8 0.5"
            strokeLinecap="round"
          />
        ))}
      {showGhost &&
        ghs.map((g) => (
          <polyline
            key={`tr-${g.id}`}
            points={pathFor(g)}
            className="fill-none stroke-ghost"
            strokeWidth="0.45"
            strokeLinecap="round"
            filter="url(#glow)"
            markerEnd={t > 0.05 ? "url(#arrowG)" : undefined}
          />
        ))}
      <polyline
        points={
          sourceFrame !== undefined
            ? (sourceTrails?.["ball"] ?? []).map((p) => p.join(",")).join(" ")
            : trail(ballPath, t)
        }
        className="fill-none stroke-foreground/40"
        strokeWidth="0.2"
        markerEnd={t > 0.05 ? "url(#arrow)" : undefined}
      />

      {showOriginal &&
        showGhost &&
        pairs.map(
          ({ g, op, gp }) =>
            Math.hypot(op[0] - gp[0], op[1] - gp[1]) > 4 && (
              <g key={`delta-${g.id}`}>
                <line
                  x1={op[0]}
                  y1={op[1]}
                  x2={gp[0]}
                  y2={gp[1]}
                  className="stroke-ghost/50"
                  strokeWidth="0.15"
                  strokeDasharray="0.4 0.4"
                />
                <g transform={`translate(${(op[0] + gp[0]) / 2} ${(op[1] + gp[1]) / 2 - 1.5})`}>
                  <rect
                    x="-5"
                    y="-1.2"
                    width="10"
                    height="2.2"
                    rx="0.5"
                    className="fill-background/85 stroke-ghost/60"
                    strokeWidth="0.1"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    y="-0.1"
                    className="fill-ghost font-mono"
                    fontSize="1.2"
                  >
                    Δ {Math.hypot(op[0] - gp[0], op[1] - gp[1]).toFixed(1)}m
                  </text>
                </g>
              </g>
            ),
        )}

      {players.map((p) => {
        if (p.role === "ghost" && !showGhost) return null;
        if (p.role === "original" && !showOriginal) return null;
        const point = position(p);
        if (!point) return null;
        const [x, y] = point;
        const isGhost = p.role === "ghost",
          isOrig = p.role === "original";
        const fill = p.team === "home" ? "fill-home" : "fill-away";
        const onBall = carrier.id === p.id && carrier.d < 3;
        const isSelected = selectedId === p.id;
        return (
          <g
            key={p.id}
            role={onPlayerClick ? "button" : undefined}
            aria-label={`Select ${p.label}`}
            tabIndex={onPlayerClick ? 0 : undefined}
            onKeyDown={
              onPlayerClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPlayerClick(p.id);
                    }
                  }
                : undefined
            }
            transform={`translate(${x} ${y})`}
            opacity={mode === "overlay" && isOrig ? 0.85 : 1}
            onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
            style={onPlayerClick ? { cursor: "pointer" } : undefined}
          >
            <ellipse cx="0.3" cy="1.6" rx="1.6" ry="0.5" className="fill-background/40" />
            {isGhost && (
              <circle r="1.6" className="ghost-ring fill-none stroke-ghost" strokeWidth="0.3" />
            )}
            {isSelected && (
              <circle
                r="2.9"
                className="fill-accent/10 stroke-accent"
                strokeWidth="0.3"
                strokeDasharray="0.9 0.5"
              />
            )}
            {onBall && (
              <circle r="2.6" className="fill-none stroke-foreground/70" strokeWidth="0.15" />
            )}
            <circle
              r="1.75"
              filter={isGhost ? "url(#glow)" : "url(#shadow)"}
              className={cn(
                isGhost ? "fill-ghost/25 stroke-ghost" : fill,
                isOrig ? "stroke-warning" : !isGhost && "stroke-foreground/80",
              )}
              strokeWidth={isGhost || isOrig ? 0.4 : 0.18}
              strokeDasharray={isGhost ? "0.7 0.35" : undefined}
            />
            <text
              y="0.05"
              textAnchor="middle"
              dominantBaseline="central"
              className={cn("font-mono font-bold", isGhost ? "fill-ghost" : "fill-foreground")}
              fontSize="1.45"
            >
              {p.num > 0 ? p.num : "—"}
            </text>
            {showLabels && (
              <g transform="translate(0 3.5)">
                <rect
                  x={-p.label.length * 0.42 - 0.6}
                  y="-1"
                  width={p.label.length * 0.84 + 1.2}
                  height="1.9"
                  rx="0.4"
                  className={
                    isGhost ? "fill-ghost/20" : isOrig ? "fill-warning/20" : "fill-background/55"
                  }
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "font-sans font-semibold",
                    isGhost ? "fill-ghost" : isOrig ? "fill-warning" : "fill-foreground/90",
                  )}
                  fontSize="1.3"
                >
                  {p.label}
                </text>
              </g>
            )}
            {onPlayerClick && <circle r="3.6" className="fill-transparent" />}
          </g>
        );
      })}

      {ghostBall && (
        <circle
          cx={ghostBall[0]}
          cy={ghostBall[1]}
          r="0.75"
          className="fill-ghost/60"
          filter="url(#glow)"
        />
      )}
      {ball && (
        <circle
          cx={ball[0]}
          cy={ball[1]}
          r="0.85"
          className={ballClassName ?? "fill-foreground stroke-background"}
          strokeWidth="0.2"
          filter="url(#shadow)"
        />
      )}

      {!sourceFrame && sourceFrame !== undefined && (
        <text
          x="52.5"
          y="34"
          textAnchor="middle"
          className="fill-foreground font-mono"
          fontSize="2"
        >
          No source frame available
        </text>
      )}
      {overlay}
    </svg>
  );
}
