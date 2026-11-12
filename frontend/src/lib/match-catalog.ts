// Real-match catalog client. The backend is the source of truth for which datasets/matches exist.
// Base URL comes from VITE_GHOSTXI_API_URL; when unset or unreachable we report "unavailable" — never fake data.
import type { DatasetRegistry, ReplayMatch } from "./backend/ghostxi";
export type Availability = "validated" | "partial" | "missing" | "unknown";
export type FrameProvenance = "observed" | "estimated" | "simulated" | "unavailable";

export type DatasetStatus = {
  provider: string; // e.g. "PFF FC", "StatsBomb Open Data"
  competition: string;
  installed: boolean;
  validated: boolean;
  matchCount: number;
  notes?: string;
};

export type MatchSummary = {
  matchId: string;
  provider: string;
  providerMatchId: string;
  competition: string;
  date: string;
  home: string;
  away: string;
  finalScore?: { home: number; away: number; verified: boolean };
  tracking: Availability;
  events: Availability;
  playerProfiles: Availability;
  trackingCoverage?: number; // 0..1
  eventCoverage?: number;
  profileCoverage?: number;
  limitations?: string[];
};

export type CatalogResult =
  | {
      state: "ok";
      datasets: DatasetStatus[];
      matches: MatchSummary[];
      registry: DatasetRegistry;
      replayMatches: ReplayMatch[];
    }
  | { state: "unavailable"; reason: string };

/** A match is a true player-movement replay only when tracking AND events are validated. */
export function replayMode(m: MatchSummary): "tracking-replay" | "event-analysis" | "unsupported" {
  if (m.tracking === "validated" && m.events !== "missing") return "tracking-replay";
  if (m.events === "validated" || m.events === "partial") return "event-analysis";
  return "unsupported";
}

/** Preferred first match from the brief. Shown as a target only — never as playable until the backend lists it. */
export const PREFERRED_MATCH = {
  provider: "PFF FC",
  providerMatchId: "10517",
  label: "Argentina vs France · FIFA World Cup 2022 Final · 18 Dec 2022",
};

export function apiBase(): string | undefined {
  const v = import.meta.env["VITE_GHOSTXI_API_URL"] as string | undefined;
  return v ? v.replace(/\/$/, "") : undefined;
}

async function getJson<T>(base: string, path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    const payload = await res.json();
    if (!payload || !Object.hasOwn(payload, "data"))
      throw new Error("Invalid GhostXI response: missing data envelope.");
    return payload.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCatalog(base = apiBase()): Promise<CatalogResult> {
  if (base === undefined)
    return { state: "unavailable", reason: "No GhostXI data backend is connected yet." };
  base = base.replace(/\/+$/, "").replace(/\/api(?:\/v1)?$/, "");
  try {
    const [registry, replayMatches] = await Promise.all([
      getJson<DatasetRegistry>(base, "/api/datasets/status"),
      getJson<ReplayMatch[]>(base, "/api/matches"),
    ]);
    // Only list matches whose dataset is installed and validated.
    if (
      !registry.verifiedDataOnly ||
      !Array.isArray(registry.providers) ||
      !Array.isArray(replayMatches)
    )
      throw new Error("Invalid verified match catalog.");
    const datasets: DatasetStatus[] = registry.providers.map((d) => ({
      provider: d.provider,
      competition: String(d["competition"] ?? "Source dataset"),
      installed: d.accessibility === "local_files_available",
      validated: d.playable,
      matchCount: d.playable ? 1 : 0,
      notes: d.validationStatus,
    }));
    const eligible = replayMatches.filter(
      (m) =>
        m.playable &&
        registry.providers.some(
          (d) => d.provider === m.provider && d.matchIdentifier === m.id && d.playable,
        ),
    );
    const matches: MatchSummary[] = eligible.map((m) => ({
      matchId: m.id,
      provider: m.source.name,
      providerMatchId: m.providerId,
      competition: m.name,
      date: m.date ?? "Date unavailable",
      home: m.teams[0]?.name ?? "Home",
      away: m.teams[1]?.name ?? "Away",
      tracking: "validated",
      events: "validated",
      playerProfiles: "partial",
      limitations: m.limitations,
    }));
    return { state: "ok", datasets, matches, registry, replayMatches: eligible };
  } catch (e) {
    return {
      state: "unavailable",
      reason: e instanceof Error ? e.message : "Backend unreachable.",
    };
  }
}
