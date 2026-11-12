import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { GhostMomentumComparison } from "@/lib/backend/ghostxi";
import { GhostMomentum } from "./ghost-momentum";

// Layout is checked in the browser; these assertions verify the user sees the
// server's selected branch values and that obsolete results disappear.
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Container,
    LineChart: Container,
    CartesianGrid: Empty,
    Legend: Empty,
    Line: Empty,
    ReferenceLine: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});
afterEach(cleanup);
const comparison: GhostMomentumComparison = {
  kind: "SIMULATED",
  matchId: "match-1",
  scenarioId: "scenario-1",
  metric: "spatial_momentum",
  window: {
    period: 2,
    startPeriodTimeSec: 60,
    startMatchTimeSec: 2760,
    startElapsedTimeSec: 2880,
    durationSec: 8,
  },
  homeTeam: { id: "h", name: "Home club" },
  awayTeam: { id: "a", name: "Away club" },
  methodology: "Same distance-based model for source and ghost paths.",
  limitations: ["Only the simulated eight seconds are covered."],
  branches: [
    {
      branchId: "individual:1",
      points: [
        {
          timeSec: 0,
          matchTimeSec: 2760,
          elapsedTimeSec: 2880,
          original: 0.1,
          ghost: 0.1,
          delta: 0,
        },
        {
          timeSec: 8,
          matchTimeSec: 2768,
          elapsedTimeSec: 2888,
          original: 0.2,
          ghost: 0.4,
          delta: 0.2,
        },
      ],
      summary: { originalMean: 0.1, ghostMean: 0.3, delta: 0.2, peakDelta: 0.2 },
    },
    {
      branchId: "combined",
      points: [
        {
          timeSec: 0,
          matchTimeSec: 2760,
          elapsedTimeSec: 2880,
          original: 0.1,
          ghost: 0.1,
          delta: 0,
        },
        {
          timeSec: 8,
          matchTimeSec: 2768,
          elapsedTimeSec: 2888,
          original: 0.2,
          ghost: -0.1,
          delta: -0.3,
        },
      ],
      summary: { originalMean: 0.1, ghostMean: -0.2, delta: -0.3, peakDelta: -0.3 },
    },
  ],
};

describe("Ghost momentum", () => {
  it("asks for a simulation rather than displaying invented momentum", () => {
    render(<GhostMomentum />);
    expect(screen.getByText(/Run a ghost simulation/)).toBeInTheDocument();
    expect(screen.queryByTestId("momentum-mean-change")).toBeNull();
  });
  it("shows the selected branch's signed change and switches to the independent combined result", () => {
    const { rerender } = render(<GhostMomentum comparison={comparison} branchId="individual:1" />);
    expect(screen.getByTestId("momentum-mean-change")).toHaveTextContent("+20.00 pts");
    expect(
      screen.getByText(/Positive favors Home club; negative favors Away club/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Period 2 · 46:00–46:08/)).toBeInTheDocument();
    rerender(<GhostMomentum comparison={comparison} branchId="combined" />);
    expect(screen.getByTestId("momentum-mean-change")).toHaveTextContent("-30.00 pts");
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("combined"),
    );
  });
  it("updates the current change with the replay playhead", () => {
    const { rerender } = render(
      <GhostMomentum comparison={comparison} branchId="individual:1" playbackTimeSec={0} />,
    );
    expect(screen.getByText(/Replay 0.0s · current change 0.00 pts/)).toBeInTheDocument();
    rerender(<GhostMomentum comparison={comparison} branchId="individual:1" playbackTimeSec={8} />);
    expect(screen.getByText(/Replay 8.0s · current change \+20.00 pts/)).toBeInTheDocument();
  });
  it("clears the old curve when a scenario is reset or the match changes", () => {
    const { rerender } = render(<GhostMomentum comparison={comparison} />);
    expect(screen.getByTestId("momentum-mean-change")).toHaveTextContent("-30.00 pts");
    rerender(<GhostMomentum comparison={undefined} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Run a ghost simulation/)).toBeInTheDocument();
  });
});
