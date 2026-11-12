import { useBackend } from "@/lib/backend-context";
import { Database, ShieldCheck } from "lucide-react";
import {
  PREFERRED_MATCH,
  replayMode,
  type Availability,
  type MatchSummary,
} from "@/lib/match-catalog";
import { Panel } from "./ui";
import { cn } from "@/lib/utils";

const tone: Record<Availability, string> = {
  validated: "text-success border-success/40 bg-success/10",
  partial: "text-warning border-warning/40 bg-warning/10",
  missing: "text-destructive border-destructive/40 bg-destructive/10",
  unknown: "text-muted-foreground border-border bg-muted/30",
};
function Flag({ label, v }: { label: string; v: Availability }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase", tone[v])}>
      {label}: {v}
    </span>
  );
}
const pct = (n?: number) => (n === undefined ? "—" : `${Math.round(n * 100)}%`);

function MatchCard({
  m,
  active,
  onPick,
}: {
  m: MatchSummary;
  active: boolean;
  onPick: () => void;
}) {
  const mode = replayMode(m);
  return (
    <button
      onClick={onPick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
        active && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {m.home} vs {m.away}
        </span>
        {m.finalScore?.verified && (
          <span className="font-mono tabular">
            {m.finalScore.home}:{m.finalScore.away}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {m.competition} · {m.date} · {m.provider} #{m.providerMatchId}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Flag label="Tracking" v={m.tracking} />
        <Flag label="Events" v={m.events} />
        <Flag label="Profiles" v={m.playerProfiles} />
        <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {mode === "tracking-replay"
            ? "Movement replay"
            : mode === "event-analysis"
              ? "Event analysis only"
              : "Not playable"}
        </span>
      </div>
    </button>
  );
}

export function RealMatchPanel() {
  const { catalog, matchId: pick, setMatchId: setPick } = useBackend();
  const res = catalog.data;
  const active =
    res?.state === "ok"
      ? (res.matches.find((m) => m.matchId === pick) ?? res.matches[0])
      : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title="Verified match catalog"
        info="Only matches the data backend has imported and validated appear here."
      >
        {!res && <p className="text-sm text-muted-foreground">Checking data backend…</p>}
        {res?.state === "unavailable" && (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Database className="size-4" /> No verified real matches available yet
            </div>
            <p className="mt-1 text-muted-foreground">
              {res.reason} Real replays appear here once tracking files are imported and validated.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              First target: <span className="text-foreground">{PREFERRED_MATCH.label}</span> (
              {PREFERRED_MATCH.provider} game {PREFERRED_MATCH.providerMatchId}) —{" "}
              <span className="font-mono uppercase">not imported</span>.
            </p>
          </div>
        )}
        {res?.state === "ok" &&
          (res.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The backend is connected but no validated matches are listed yet.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {res.matches.map((m) => (
                <MatchCard
                  key={m.matchId}
                  m={m}
                  active={m.matchId === active?.matchId}
                  onPick={() => setPick(m.matchId)}
                />
              ))}
            </div>
          ))}
      </Panel>
      <Panel title="Data source" action={<ShieldCheck className="size-4 text-muted-foreground" />}>
        {active ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{active.provider}</dd>
            <dt className="text-muted-foreground">Match ID</dt>
            <dd className="font-mono">{active.providerMatchId}</dd>
            <dt className="text-muted-foreground">Tracking</dt>
            <dd>
              {active.tracking} · {pct(active.trackingCoverage)}
            </dd>
            <dt className="text-muted-foreground">Events</dt>
            <dd>
              {active.events} · {pct(active.eventCoverage)}
            </dd>
            <dt className="text-muted-foreground">Profiles</dt>
            <dd>
              {active.playerProfiles} · {pct(active.profileCoverage)}
            </dd>
            {active.limitations?.length ? (
              <>
                <dt className="col-span-2 mt-1 text-muted-foreground">Limitations</dt>
                <dd className="col-span-2">{active.limitations.join(" · ")}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              <span className="font-mono text-foreground">OBSERVED</span> recorded tracking ·{" "}
              <span className="font-mono text-foreground">ESTIMATED</span> provider estimate ·{" "}
              <span className="font-mono text-foreground">SIMULATED</span> model output ·{" "}
              <span className="font-mono text-foreground">UNAVAILABLE</span> missing source data.
            </p>
            <p>
              No real match loaded. The lab below is a{" "}
              <span className="text-foreground">synthetic design preview</span> with fictional
              players — not historical data.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
