import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCatalog } from "./match-catalog";
import { ghostxi } from "./ghostxi-api";
import { useSport } from "./sport-context";
import type { VerifiedSimulationResult, SavedSimulationScenario } from "./backend/ghostxi";

function useBackendState() {
  const { sport } = useSport();
  const [matchId, setMatchId] = useState("");
  const [sourceMode, setSourceMode] = useState<"events" | "tracking">("events");
  const [teamName, setTeamName] = useState("Arsenal");
  const [eventId, setEventId] = useState("");
  const eventCatalog = useQuery({
    queryKey: ["ghostxi", "event-catalog"],
    queryFn: () => ghostxi.getEventMatches(),
    enabled: sport === "football",
    staleTime: 300000,
    retry: false,
  });
  const eventMatches = eventCatalog.data ?? [];
  const teams = [...new Set(eventMatches.flatMap((m) => [m.home.name, m.away.name]))].sort();
  const activeTeam = teams.includes(teamName) ? teamName : (teams[0] ?? "");
  const teamMatches = eventMatches
    .filter((m) => m.home.name === activeTeam || m.away.name === activeTeam)
    .sort((a, b) => b.date.localeCompare(a.date));
  const activeEventId = teamMatches.find((m) => m.id === eventId)?.id ?? teamMatches[0]?.id ?? "";
  const eventMatch = useQuery({
    queryKey: ["ghostxi", "event-match", activeEventId],
    queryFn: () => ghostxi.getEventMatch(activeEventId),
    enabled: sport === "football" && sourceMode === "events" && !!activeEventId,
  });
  const eventPlayers = useQuery({
    queryKey: ["ghostxi", "event-players", activeEventId],
    queryFn: () => ghostxi.getEventPlayers(activeEventId),
    enabled: sport === "football" && sourceMode === "events" && !!activeEventId,
  });
  const eventMomentum = useQuery({
    queryKey: ["ghostxi", "event-momentum", activeEventId],
    queryFn: () => ghostxi.getEventMomentum(activeEventId),
    enabled: sport === "football" && sourceMode === "events" && !!activeEventId,
  });
  const eventActions = useQuery({
    queryKey: ["ghostxi", "event-actions", activeEventId],
    queryFn: async () => {
      const first = await ghostxi.getEvents(activeEventId, { limit: 500 });
      const pages = await Promise.all(
        Array.from({ length: Math.ceil(first.total / 500) - 1 }, (_, i) =>
          ghostxi.getEvents(activeEventId, { limit: 500, offset: (i + 1) * 500 }),
        ),
      );
      return [...first.items, ...pages.flatMap((p) => p.items)];
    },
    enabled: sport === "football" && sourceMode === "events" && !!activeEventId,
  });
  const [selection, setSelection] = useState<{
    scenario: SavedSimulationScenario;
    result: VerifiedSimulationResult;
  } | null>(null);
  const catalog = useQuery({
    queryKey: ["ghostxi", "catalog"],
    queryFn: () => loadCatalog(),
    enabled: sport === "football",
    staleTime: 30000,
    retry: false,
  });
  const matches = catalog.data?.state === "ok" ? catalog.data.replayMatches : [];
  const activeId = matches.find((m) => m.id === matchId)?.id ?? matches[0]?.id ?? "";
  const detail = useQuery({
    queryKey: ["ghostxi", "match", activeId],
    queryFn: () => ghostxi.getReplayMatch(activeId),
    enabled: !!activeId && sport === "football",
  });
  return {
    sourceMode,
    setSourceMode: (mode: "events" | "tracking") => {
      setSourceMode(mode);
      setSelection(null);
    },
    teamName: activeTeam,
    teams,
    teamMatches,
    eventMatches,
    eventCatalog,
    setTeamName: (name: string) => {
      setTeamName(name);
      setEventId("");
      setSelection(null);
    },
    eventId: activeEventId,
    setEventId: (id: string) => {
      setEventId(id);
      setSelection(null);
    },
    eventMatch,
    eventPlayers,
    eventMomentum,
    eventActions,
    catalog,
    matches,
    match: detail.data,
    detail,
    matchId: activeId,
    setMatchId,
    selection,
    setSelection,
  };
}
const BackendContext = createContext<ReturnType<typeof useBackendState> | null>(null);
export function BackendProvider({ children }: { children: ReactNode }) {
  const value = useBackendState();
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}
export function useBackend() {
  const value = useContext(BackendContext);
  if (!value) throw new Error("BackendProvider is required");
  return value;
}
