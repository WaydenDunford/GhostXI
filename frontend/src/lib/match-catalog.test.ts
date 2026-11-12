import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog, replayMode, type MatchSummary } from "./match-catalog";
const summary: MatchSummary = {
  matchId: "1",
  provider: "PFF FC",
  providerMatchId: "10517",
  competition: "WC",
  date: "2022-12-18",
  home: "Argentina",
  away: "France",
  tracking: "validated",
  events: "validated",
  playerProfiles: "validated",
};
const match = {
  id: "metrica-game-1",
  provider: "metrica",
  providerId: "1",
  name: "Metrica Sample Game 1",
  date: null,
  teams: [
    { id: "HOME", name: "Home (anonymous)" },
    { id: "AWAY", name: "Away (anonymous)" },
  ],
  playable: true,
  score: null,
  source: { name: "Metrica Sports Sample Data" },
  limitations: ["Anonymous source identities"],
};
afterEach(() => vi.unstubAllGlobals());
function serve(playable = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json({
        data: url.endsWith("/status")
          ? {
              verifiedDataOnly: true,
              providers: [
                {
                  provider: "metrica",
                  matchIdentifier: "metrica-game-1",
                  playable,
                  accessibility: "local_files_available",
                  validationStatus: "validated_tracking_windows",
                },
              ],
            }
          : [match],
      }),
    ),
  );
}
describe("GhostXI catalog adapter", () => {
  it("distinguishes replay from event-only analysis", () => {
    expect(replayMode(summary)).toBe("tracking-replay");
    expect(replayMode({ ...summary, tracking: "partial" })).toBe("event-analysis");
    expect(replayMode({ ...summary, tracking: "missing", events: "missing" })).toBe("unsupported");
  });
  it("reads the real data envelope and normalizes source IDs without inventing dates or scores", async () => {
    serve();
    const r = await loadCatalog("http://local/");
    expect(r.state).toBe("ok");
    if (r.state !== "ok") throw new Error(r.reason);
    expect(r.matches[0]).toMatchObject({
      matchId: "metrica-game-1",
      provider: "Metrica Sports Sample Data",
      date: "Date unavailable",
      home: "Home (anonymous)",
      playerProfiles: "partial",
    });
    expect(r.matches[0]?.finalScore).toBeUndefined();
    expect(r.replayMatches[0]?.id).toBe("metrica-game-1");
    expect(fetch).toHaveBeenCalledWith("http://local/api/matches", expect.anything());
  });
  it("excludes unvalidated provider matches even if a match advertises itself as playable", async () => {
    serve(false);
    const r = await loadCatalog("http://local");
    expect(r.state === "ok" && r.matches).toEqual([]);
  });
  it("shows an unavailable state for errors and incompatible backend responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([match])),
    );
    expect((await loadCatalog("http://local")).state).toBe("unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "offline" } }, { status: 503 })),
    );
    expect((await loadCatalog("http://local")).state).toBe("unavailable");
  });
});
