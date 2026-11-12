import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCatalog } from "./match-catalog";
import { ghostxi } from "./ghostxi-api";
import { useSport } from "./sport-context";
import type { VerifiedSimulationResult, SavedSimulationScenario } from "./backend/ghostxi";

function useBackendState() {
  const { sport } = useSport();
  const [matchId, setMatchId] = useState("");
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
