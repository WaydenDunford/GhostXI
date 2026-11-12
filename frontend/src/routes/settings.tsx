import { useBackend } from "@/lib/backend-context";
import { useQuery } from "@tanstack/react-query";
import { ghostxi } from "@/lib/ghostxi-api";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSport } from "@/lib/sport-context";
import { DataBadge, DemoBadge, PageHeader, Panel } from "@/components/ghost/ui";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — GhostXI" },
      {
        name: "description",
        content: "Configure GhostXI simulation, confidence thresholds and scouting weights.",
      },
      { property: "og:title", content: "GhostXI Settings" },
      { property: "og:description", content: "Simulation and scouting configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { sport } = useSport();
  return <SettingsView />;
}

function SettingsView() {
  const { config, dataset } = useSport();
  const backend = useBackend();
  const connected = config.id === "football";
  const model = useQuery({
    queryKey: ["ghostxi", "model-config"],
    queryFn: () => ghostxi.getRecommendationConfig(),
    enabled: connected,
  });
  const providers =
    backend.catalog.data?.state === "ok" ? backend.catalog.data.registry.providers : [];
  const [light, setLight] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
  }, [light]);
  const [weights, setWeights] = useState({
    Tactical: 35,
    Physical: 20,
    Technical: 25,
    Potential: 20,
  });
  const [conf, setConf] = useState([75]);
  const [runs, setRuns] = useState([500]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader eyebrow="Configuration" title="Settings" />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Appearance">
          <div className="flex items-center justify-between">
            <Label htmlFor="light">Light theme</Label>
            <Switch id="light" checked={light} onCheckedChange={setLight} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Label>Language</Label>
            <Select defaultValue="en">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="bs" disabled>
                  Bosanski (soon)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Panel>
        <Panel title="Data source labels">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <DataBadge kind="observed" />
              <span className="text-muted-foreground">Event + on-ball tracking</span>
            </li>
            <li className="flex justify-between">
              <DataBadge kind="estimated" />
              <span className="text-muted-foreground">Reconstructed off-ball</span>
            </li>
            <li className="flex justify-between">
              <DataBadge kind="simulated" />
              <span className="text-muted-foreground">GhostXI scenario model</span>
            </li>
          </ul>
        </Panel>
        <Panel title={`Data providers · ${config.name}`} className="md:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {(connected
              ? providers.map((p) => ({
                  name: `${p.provider} · ${p.matchIdentifier ?? "No imported match"}`,
                  status: p.playable ? "integrated" : p.validationStatus.replaceAll("_", " "),
                }))
              : config.dataSources
            ).map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between rounded-md border bg-panel px-3 py-2.5 text-sm"
              >
                <span className="font-medium">{d.name}</span>
                {d.status === "integrated" ? (
                  <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-success">
                    Integrated
                  </span>
                ) : (
                  <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                    {connected ? d.status : "Demo data"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {dataset.demo
              ? `No real ${config.name.toLowerCase()} dataset is connected yet. Every figure on this sport is synthetic demo data, kept separate from real feeds.`
              : "These feeds are football-specific and are never presented as data for other sports."}
          </p>
        </Panel>
        <Panel title="Simulation settings">
          <Label>
            Simulation runs per scenario:{" "}
            <span className="font-mono">{connected ? "1 · deterministic model" : runs[0]}</span>
          </Label>
          <Slider
            className="mt-3"
            min={100}
            max={2000}
            step={100}
            value={runs}
            onValueChange={setRuns}
            disabled={connected}
          />
          <div className="mt-4 flex items-center justify-between">
            <Label htmlFor="pr">Physics-aware movement</Label>
            <Switch id="pr" defaultChecked disabled={connected} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Engine:{" "}
            {connected
              ? "Deterministic steering with shared modeled physical parameters"
              : config.simulationStrategy}
          </p>
        </Panel>
        <Panel title="Confidence settings">
          <Label>
            High-confidence threshold:{" "}
            <span className="font-mono">
              {connected ? "Unavailable · uncalibrated" : `${conf[0]}%`}
            </span>
          </Label>
          <Slider
            className="mt-3"
            min={50}
            max={95}
            step={5}
            value={conf}
            onValueChange={setConf}
            disabled={connected}
          />
          <div className="mt-4 flex items-center justify-between">
            <Label htmlFor="hide">Hide low-confidence insights</Label>
            <Switch id="hide" disabled={connected} />
          </div>
        </Panel>
        <Panel
          title={`${connected ? "Recommendation" : "Scouting"} weights · ${config.name}`}
          className="md:col-span-2"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {Object.entries(
              connected
                ? Object.fromEntries(
                    Object.entries(model.data?.weights ?? {}).map(([k, v]) => [k, v * 100]),
                  )
                : weights,
            ).map(([k, v]) => (
              <div key={k}>
                <Label>
                  {k} <span className="font-mono text-muted-foreground">{v}%</span>
                </Label>
                <Slider
                  className="mt-2"
                  max={100}
                  value={[v]}
                  onValueChange={([n]) => setWeights((w) => ({ ...w, [k]: n }))}
                  disabled={connected}
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {connected
              ? "Weights are read from the active backend model."
              : `Tracked attributes: ${config.scoutingMetrics.join(" · ")}`}
          </p>
        </Panel>
        <Panel title="Sport profile" className="md:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Format", `${config.playersPerTeam} vs ${config.playersPerTeam}`],
              ["Periods", config.periods],
              ["Surface", config.surfaceLabel],
              ["Scoring", config.scoringRules],
            ].map(([k, v]) => (
              <div key={k} className={cn("rounded-md bg-panel p-2.5")}>
                <dt className="text-eyebrow">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="About GhostXI" className="md:col-span-2">
          <p className="text-sm text-muted-foreground">
            GhostXI v1.0 · Multi-sport decision support for Fair Scouting, Match Momentum and Smart
            Coach.
          </p>
          <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            GhostXI is a decision-support tool and not a match outcome prediction engine.
          </p>
        </Panel>
      </div>
    </div>
  );
}
