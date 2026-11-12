import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBackend } from "@/lib/backend-context";
import { ghostxi } from "@/lib/ghostxi-api";
import { DataBadge, PageHeader, Panel } from "./ui";
import { BackendGate, Picker } from "./verified-lab";

export function ConnectedMomentum() {
  return (
    <BackendGate>
      <MomentumContent />
    </BackendGate>
  );
}
function MomentumContent() {
  const { match, matchId } = useBackend();
  const [pick, setPick] = useState("source");
  const eventMatches = useQuery({
    queryKey: ["ghostxi", "event-matches"],
    queryFn: () => ghostxi.getEventMatches(),
  });
  const original = useQuery({
    queryKey: ["ghostxi", "momentum", matchId],
    queryFn: () => ghostxi.getMomentum(matchId),
  });
  const event = eventMatches.data?.find((m) => m.id === pick);
  const eventMomentum = useQuery({
    queryKey: ["ghostxi", "event-momentum", pick],
    queryFn: () => ghostxi.getEventMomentum(event!.providerId),
    enabled: !!event,
  });
  const eventDetail = useQuery({
    queryKey: ["ghostxi", "event-detail", pick],
    queryFn: () => ghostxi.getEventMatch(event!.providerId),
    enabled: !!event,
  });
  const points = event
    ? eventMomentum.data?.points.map((p) => ({ minute: p.elapsedSeconds / 60, value: p.value }))
    : original.data?.points;
  const loading = event ? eventMomentum.isPending : original.isPending;
  const error = event ? eventMomentum.error : original.error;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Recorded match events" title="Momentum Analysis">
        <DataBadge kind="observed" />
      </PageHeader>
      <div className="max-w-xl">
        <Picker
          label="Momentum match"
          value={pick}
          onChange={setPick}
          options={[
            { id: "source", label: match!.name },
            ...(eventMatches.data ?? []).map((m) => ({
              id: m.id,
              label: `${m.name} · ${m.date} · events only`,
            })),
          ]}
        />
      </div>
      <Panel title={event?.name ?? match!.name}>
        <p className="mb-3 text-xs text-muted-foreground">
          {event ? eventMomentum.data?.method : original.data?.methodology}
        </p>
        {loading && <p role="status">Loading match momentum…</p>}
        {error && <p role="alert">{error.message}</p>}
        <div className="h-80">
          <ResponsiveContainer>
            <AreaChart data={points ?? []} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="minute"
                fontSize={11}
                stroke="var(--muted-foreground)"
                tickFormatter={(n) => `${Math.round(n)}′`}
              />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              <Area
                type="linear"
                dataKey="value"
                name="Recorded event momentum"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {event
            ? "StatsBomb Open Data · event analysis only. No continuous player tracking or ghost replay is imported for this match."
            : original.data?.coverage}
        </p>
        {event && (
          <img
            alt="StatsBomb Open Data"
            className="mt-3 w-32"
            src={`${(import.meta.env["VITE_GHOSTXI_API_URL"] ?? "").replace(/\/+$/, "")}/api/v1/datasets/statsbomb/logo`}
          />
        )}
      </Panel>
      {eventDetail.data && (
        <Panel title="Source key moments">
          <ul className="divide-y">
            {eventDetail.data.keyMoments.slice(0, 15).map((m) => (
              <li key={m.eventId} className="py-2 text-sm">
                <span className="mr-3 font-mono text-primary">
                  {m.minute}:{String(m.second).padStart(2, "0")}
                </span>
                {m.type} · {m.playerName ?? m.teamName}
                {m.xg !== null && ` · xG ${m.xg.toFixed(3)}`}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
