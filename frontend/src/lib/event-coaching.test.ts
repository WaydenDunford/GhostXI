import { describe, expect, it } from "vitest";
import type { EventPlayer } from "./backend/ghostxi";
import { buildEventCoachingActions } from "./event-coaching";

const player = (id: string, stats: EventPlayer["stats"], teamName = "Spain") =>
  ({ id, name: id, teamName, stats }) as EventPlayer;

describe("event coaching reviews", () => {
  it("gives measured, named actions from the selected team's match", () => {
    const actions = buildEventCoachingActions(
      [
        player("Passing player", { passesAttempted: 20, passesCompleted: 15 }),
        player("Shooting player", { shots: 3, xg: 0.21 }),
        player("Recovery player", { recoveries: 6 }),
        player(
          "Opponent",
          { passesAttempted: 30, passesCompleted: 5, shots: 8, xg: 2, recoveries: 10 },
          "England",
        ),
      ],
      "Spain",
    );
    expect(actions).toHaveLength(3);
    expect(actions[0]?.evidence).toContain("15 of 20 passes (75.0%)");
    expect(actions[0]?.action).toContain("5 incomplete passes");
    expect(actions[1]?.evidence).toContain("0.07 xG per shot");
    expect(actions[2]?.evidence).toContain("6 ball recoveries");
    expect(JSON.stringify(actions)).not.toMatch(/Opponent|should replace|confidence|simulated/i);
  });

  it("does not judge passing on fewer than ten attempts or missing/nonfinite counts", () => {
    expect(
      buildEventCoachingActions([
        player("Tiny sample", { passesAttempted: 9, passesCompleted: 2 }),
        player("Missing", { passesAttempted: 20, passesCompleted: null, shots: 2, xg: null }),
        player("Invalid", { passesAttempted: Infinity, passesCompleted: 20, recoveries: NaN }),
        player("Impossible", { passesAttempted: 10, passesCompleted: 12 }),
      ]),
    ).toEqual([]);
  });

  it("a fully completed passing sample produces a rehearsal action instead of invented losses", () => {
    const actions = buildEventCoachingActions([
      player("Accurate player", { passesAttempted: 10, passesCompleted: 10 }),
    ]);
    expect(actions[0]?.title).toContain("Rehearse");
    expect(actions[0]?.evidence).toContain("100.0%");
    expect(actions[0]?.action).not.toContain("incomplete");
  });
});
