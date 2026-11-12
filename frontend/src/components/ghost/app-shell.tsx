import { useBackend } from "@/lib/backend-context";
import { MatchSelector } from "./match-selector";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  BarChart3,
  Brain,
  FileText,
  LayoutDashboard,
  Menu,
  Radar,
  Settings,
  Swords,
  Ghost,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSport } from "@/lib/sport-context";
import { sportList } from "@/lib/sports";
import type { SportId } from "@/lib/sports";
import { DemoBadge } from "@/components/ghost/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/match-lab", label: "Match Lab", icon: Swords },
  { to: "/momentum", label: "Momentum Analysis", icon: BarChart3 },
  { to: "/scouting", label: "Scouting", icon: Radar },
  { to: "/coach", label: "Smart Coach", icon: Brain },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const { sport, setSport, config, dataset } = useSport();
  const { match } = dataset;
  const backend = useBackend();
  const connectedFootball = sport === "football";

  const sportSelector = (
    <Select value={sport} onValueChange={(v) => setSport(v as SportId)}>
      <SelectTrigger
        className="h-8 w-auto gap-1.5 border-border/60 bg-muted/50 px-2.5 text-xs font-semibold"
        aria-label="Select sport"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sportList.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <span>{s.icon}</span>
              {s.name}
              <span className="text-muted-foreground">
                {s.playersPerTeam}v{s.playersPerTeam}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Ghost className="size-5" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-display text-lg font-bold leading-none tracking-wide">
                GhostXI
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {config.name} Intelligence
              </div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                <n.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                {!collapsed && n.label}
              </Link>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="m-3 space-y-2">
            <div className="rounded-lg border border-sidebar-border p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 animate-live rounded-full bg-destructive" />
                Active match · {config.icon}
              </div>
              <div className="font-semibold">
                {connectedFootball
                  ? `${match.home.name} ${match.home.score ?? "—"}–${match.away.score ?? "—"} ${match.away.name}`
                  : `${match.home.short} ${match.home.score}–${match.away.score} ${match.away.short}`}
              </div>
              <div className="text-muted-foreground">{match.date}</div>
              {dataset.demo && <DemoBadge className="mt-2" />}
            </div>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded-md p-1.5 hover:bg-muted md:block"
            aria-label="Toggle sidebar"
          >
            <Menu className="size-4" />
          </button>
          <div className="flex gap-1 overflow-x-auto md:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded p-1.5 hover:bg-muted"
                aria-label={n.label}
              >
                <n.icon className="size-4" />
              </Link>
            ))}
          </div>
          {sportSelector}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {dataset.demo && <DemoBadge className="hidden sm:inline-flex" />}
            <span className="hidden sm:inline">
              {connectedFootball
                ? backend.sourceMode === "events"
                  ? "StatsBomb Open Data"
                  : (backend.match?.source.name ?? "Local data service")
                : match.competition}
            </span>
            <span className="rounded border px-2 py-0.5 font-mono">
              {connectedFootball
                ? backend.sourceMode === "events"
                  ? `${backend.eventMatch.data?.eventCount ?? 0} source events`
                  : `${backend.match?.coverage.frameCount ?? 0} source frames`
                : `Coverage ${Math.round(match.coverage * 100)}%`}
            </span>
          </div>
        </header>
        {connectedFootball && <MatchSelector />}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
