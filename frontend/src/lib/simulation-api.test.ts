import { describe, expect, it } from "vitest";
import { createMockApi } from "./simulation-api";
import { sportList } from "./sports";

describe("mock simulation API", () => {
  it("recommends 3–5 moments relevant to a central midfielder", async () => {
    const api = createMockApi("football");
    const recs = await api.getMoments("m-2024-sar-zel", "h8", 5); // Rahmanović, CM
    expect(recs.length).toBeGreaterThanOrEqual(3);
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs[0]!.relevanceScore).toBeGreaterThanOrEqual(recs[recs.length - 1]!.relevanceScore);
    expect(recs[0]!.relevanceReasons.length).toBeGreaterThan(0);
  });

  it("returns bench and scouting candidates with natural fit above override", async () => {
    const api = createMockApi("football");
    const cands = await api.getCandidates("m-2024-sar-zel", "h7"); // Mešić, RW
    expect(cands.some((c) => c.source === "bench")).toBe(true);
    expect(cands.some((c) => c.source === "scouting")).toBe(true);
    const natural = cands.find((c) => c.position === "RW");
    const override = cands.find((c) => c.position === "CB");
    expect(natural!.positionFit!).toBeGreaterThan(override!.positionFit!);
  });

  it("simulation is deterministic for the same scenario seed", async () => {
    const api = createMockApi("football");
    const scenario = {
      id: "sc-test",
      sportId: "football",
      matchId: "m-2024-sar-zel",
      momentId: "8",
      originalPlayerId: "h7",
      candidatePlayerId: "p1",
      seed: 42,
    };
    const a = await api.simulate(scenario);
    const b = await api.simulate(scenario);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.status).toBe("completed");
    expect(a.limitations.length).toBeGreaterThan(0);
    expect(a.originalFrames.length).toBeGreaterThan(0);
  });

  it("every sport has a working lineup, moments and candidates", async () => {
    for (const s of sportList) {
      const api = createMockApi(s.id);
      const lineup = await api.getLineup("any");
      expect(lineup.starting.length).toBe(s.playersPerTeam);
      const recs = await api.getMoments("any", lineup.starting[0]!.id, 5);
      expect(recs.length).toBeGreaterThanOrEqual(3);
      const cands = await api.getCandidates("any", lineup.starting[0]!.id);
      expect(cands.length).toBeGreaterThan(0);
    }
  });
});
