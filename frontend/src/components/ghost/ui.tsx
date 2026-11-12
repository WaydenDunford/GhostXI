import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { verdictTone, type DataKind, type Verdict } from "@/lib/mock-data";

const kindTone: Record<DataKind, string> = {
  observed: "bg-observed/10 text-observed border-observed/40",
  estimated: "bg-estimated/10 text-estimated border-estimated/40",
  simulated: "bg-simulated/10 text-simulated border-simulated/40",
};
const kindHelp: Record<DataKind, string> = {
  observed: "Recorded directly from match event/tracking data.",
  estimated: "Reconstructed from partial data (e.g. off-ball positions).",
  simulated: "Produced by the GhostXI scenario model — not real events.",
};

export function DataBadge({ kind, className }: { kind: DataKind; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              kindTone[kind],
              className,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {kind}
          </span>
        </TooltipTrigger>
        <TooltipContent>{kindHelp[kind]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Provenance labels for the national-team module (OBSERVED / RECONSTRUCTED /
// SIMULATED / DEMO) — separate from DataKind so existing pages stay untouched.
export type ProvenanceKind = "observed" | "reconstructed" | "simulated" | "demo";
const provTone: Record<ProvenanceKind, string> = {
  observed: "bg-observed/10 text-observed border-observed/40",
  reconstructed: "bg-estimated/10 text-estimated border-estimated/40",
  simulated: "bg-simulated/10 text-simulated border-simulated/40",
  demo: "bg-warning/10 text-warning border-warning/50",
};
const provHelp: Record<ProvenanceKind, string> = {
  observed: "Verified tracking coordinates from an integrated feed.",
  reconstructed: "Positions inferred from incomplete match data — not a verified tracking feed.",
  simulated: "Counterfactual player movement produced by the scenario model.",
  demo: "Illustrative generated scenario — not a recorded historical event.",
};

export function ProvenanceBadge({ kind, className }: { kind: ProvenanceKind; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              provTone[kind],
              className,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {kind}
          </span>
        </TooltipTrigger>
        <TooltipContent>{provHelp[kind]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning",
              className,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            Demo data
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Synthetic demo fixture — no real provider dataset is connected for this sport yet.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConfidenceBadge({ value }: { value: number | null }) {
  const high = value !== null && value >= 0.75;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        high ? "border-success/40 text-success" : "border-warning/40 text-warning",
      )}
    >
      {value === null
        ? "Confidence unavailable"
        : `${high ? "High" : "Low"} confidence · ${Math.round(value * 100)}%`}
    </span>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        verdictTone[verdict],
        className,
      )}
    >
      {verdict}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground hover:text-foreground">
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  info,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  info?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-panel", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h3 className="flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
            {info && <InfoTip text={info} />}
          </h3>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function StatBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular">{hint ?? value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 96 }: { value: number | null; size?: number }) {
  const r = 40,
    c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
      <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="fill-none stroke-primary"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (value ?? 0) / 100)}
      />
      <text
        x="50"
        y="50"
        className="rotate-90 fill-foreground font-display text-[26px] font-bold"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ transformOrigin: "50px 50px" }}
      >
        {value ?? "—"}
      </text>
    </svg>
  );
}
