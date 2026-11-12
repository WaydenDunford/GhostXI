import { useQuery } from "@tanstack/react-query";
import { useBackend } from "./backend-context";
import { useSport } from "./sport-context";
import { ghostxi } from "./ghostxi-api";
export type { CoachingReport } from "./backend/ghostxi";

export function useCoachingReport() {
  const { sport } = useSport();
  const { matchId, sourceMode, selection } = useBackend();
  const selected = selection?.scenario.matchId === matchId ? selection : null;
  const query = useQuery({
    queryKey: ["ghostxi", "coaching-report", matchId, selected?.scenario ?? null],
    queryFn: ({ signal }) => ghostxi.getCoachingReport({ matchId, ...(selected ? { scenarioId: selected.scenario.id } : {}) }, { signal }),
    enabled: sport === "football" && sourceMode === "tracking" && !!matchId,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  return { report: query.data, isPending: query.isPending || query.isFetching, error: query.error, refetch: query.refetch };
}
