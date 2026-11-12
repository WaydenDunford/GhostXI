import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useBackend } from "@/lib/backend-context";
import { useCoachingReport, type CoachingReport } from "@/lib/coaching-report";
import { SimulationCoaching } from "./simulation-coaching";

vi.mock("@/lib/backend-context", () => ({ useBackend: vi.fn() }));
vi.mock("@/lib/coaching-report", () => ({ useCoachingReport: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const refetch = vi.fn();
const match: CoachingReport["context"]["match"] = {
  id: "sample-match",
  provider: "test",
  providerId: "sample",
  name: "Sample Home vs Sample Away",
  date: "2026-01-01",
  teams: [
    { id: "home", providerId: "home", name: "Sample Home" },
    { id: "away", providerId: "away", name: "Sample Away" },
  ],
  score: { home: 2, away: 1 },
  pitch: { length: 105, width: 68 },
  fps: 25,
  playable: true,
  trackingStatus: ["observed"],
  coverage: {
    playable: true,
    frameCount: 200,
    status: "observed",
    missingBall: 0,
    missingPlayerValues: 0,
    segments: [],
    gaps: [],
    bosniaBlocked: false,
  },
  source: { name: "Test source", url: "https://example.test/sample" },
  limitations: [],
};

function report(overrides: Partial<CoachingReport> = {}): CoachingReport {
  return {
    matchId: match.id,
    scenarioId: "scenario-1",
    momentId: "moment-1",
    originalPlayerId: "starter",
    originalPlayerName: "Original Player",
    windowSeconds: 8,
    verdict: "replace",
    headline: "Test Replacement Player for Original Player",
    summary: "Replacement Player stays closer to the ball over this eight-second simulation.",
    reasons: ["Average distance to the ball falls from 14.20 m to 10.00 m."],
    actions: ["Test Replacement Player in Match Lab before changing the lineup."],
    alternatives: [
      {
        candidateId: "replacement",
        candidateName: "Replacement Player",
        availability: "match-bench",
        teamName: "Sample Home",
        verdict: "replace",
        originalValue: 0.1,
        alternativeValue: 0.2,
        delta: 0.1,
        reason: "Closer ball support in this moment.",
        metrics: [
          {
            id: "internal_metric_key",
            label: "Average distance to ball",
            original: 14.2,
            alternative: 10,
            delta: -4.2,
            unit: "m",
          },
        ],
      },
    ],
    preferredCandidateId: "replacement",
    evidenceNote: "This decision describes the selected clip and its simulated movement.",
    comparisonsTied: false,
    context: {
      match,
      momentTitle: "Build-up on the right",
      period: 1,
      startPeriodTimeSec: 10.04,
      endPeriodTimeSec: 18.04,
      analysisOrigin: "automatic",
      comparedCount: 1,
    },
    scenario: {
      id: "scenario-1",
      sportId: "football",
      matchId: match.id,
      momentId: "moment-1",
      originalPlayerId: "starter",
      candidatePlayerId: "replacement",
      seed: 1,
    },
    simulation: {} as CoachingReport["simulation"],
    ...overrides,
  };
}

function setReport(value: CoachingReport | undefined, error: Error | null = null) {
  vi.mocked(useCoachingReport).mockReturnValue({
    report: value,
    isPending: !value && !error,
    error,
    refetch,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useBackend).mockReturnValue({ match } as unknown as ReturnType<typeof useBackend>);
});
afterEach(cleanup);

describe("SimulationCoaching", () => {
  it("shows a named substitution suggestion with actual simulated measures and scope", () => {
    setReport(report());
    render(<SimulationCoaching variant="coach" />);

    expect(
      screen.getByRole("heading", { name: "Test Replacement Player for Original Player" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8-second simulation · 1 option compared")).toBeInTheDocument();
    expect(screen.getByText("Average distance to ball")).toBeInTheDocument();
    expect(screen.getByText("14.20 m")).toBeInTheDocument();
    expect(screen.getByText("10.00 m")).toBeInTheDocument();
    expect(screen.getByText(match.name)).toBeInTheDocument();
    expect(screen.getByText("Build-up on the right")).toBeInTheDocument();
    expect(screen.getByText("Automatic moment review")).toBeInTheDocument();
    expect(screen.getByText("Match bench · Sample Home")).toBeInTheDocument();
    expect(screen.getByText(/reference players are comparison experiments/)).toBeInTheDocument();
    expect(
      screen.queryByText(/backend|not connected|internal_metric_key/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh analysis" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("recommends keeping the named original when the alternative loses the comparison", () => {
    const value = report();
    setReport(
      report({
        verdict: "keep",
        headline: "Keep Original Player for this moment",
        summary: "Replacement Player moves farther from the ball in the simulation.",
        preferredCandidateId: null,
        alternatives: [
          { ...value.alternatives[0]!, verdict: "keep", reason: "Less support around the ball." },
        ],
        actions: ["Keep Original Player in this role and compare another moment."],
      }),
    );
    render(<SimulationCoaching variant="coach" />);

    expect(
      screen.getByRole("heading", { name: "Keep Original Player for this moment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Keep Original Player in this role and compare another moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Test the replacement")).not.toBeInTheDocument();
  });

  it("explains tied alternatives without inventing a preferred player", () => {
    const value = report();
    setReport(
      report({
        verdict: "inconclusive",
        headline: "No clear replacement advantage for Original Player",
        comparisonsTied: true,
        preferredCandidateId: null,
        alternatives: [
          { ...value.alternatives[0]!, verdict: "inconclusive" },
          {
            ...value.alternatives[0]!,
            candidateId: "second",
            candidateName: "Second Option",
            availability: "reference-player",
            teamName: "Reference Team",
            verdict: "inconclusive",
          },
        ],
      }),
    );
    render(<SimulationCoaching variant="report" />);

    expect(
      screen.getByText(/no evidence here to prefer one of those players/i),
    ).toBeInTheDocument();
    expect(screen.getByText("2 options compared", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("No clear advantage")).toHaveLength(3);
    expect(screen.getByText("Reference player · Reference Team")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeInTheDocument();
    expect(
      screen.queryByText(/confidence|best player|not connected|backend/i),
    ).not.toBeInTheDocument();
  });

  it("offers a retry without exposing technical failure text", () => {
    setReport(undefined, new Error("backend unavailable: stack /private/file"));
    render(<SimulationCoaching variant="coach" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose another moment in Match Lab or retry",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry comparison" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(/backend|private\/file/i)).not.toBeInTheDocument();
  });

  it("shows combined changes and labels near-ball time as a share of the clip", () => {
    const branch: NonNullable<CoachingReport["branches"]>[number] = {
      kind: "combined",
      replacements: [
        {
          originalPlayerId: "starter",
          originalPlayerName: "Original Player",
          candidatePlayerId: "replacement",
          candidateName: "Replacement Player",
        },
        {
          originalPlayerId: "other-starter",
          originalPlayerName: "Other Starter",
          candidatePlayerId: "other-replacement",
          candidateName: "Other Replacement",
        },
      ],
      verdict: "replace",
      reason: "Both changes improve support in this moment.",
      reasons: [],
      originalValue: 0.1,
      alternativeValue: 0.2,
      delta: 0.1,
      metrics: [
        {
          id: "ball_access",
          label: "Time close to ball",
          original: 25,
          alternative: 40,
          delta: 15,
          unit: "%",
        },
      ],
    };
    setReport(report({ branches: [branch] }));
    render(<SimulationCoaching variant="report" />);

    expect(screen.getByRole("heading", { name: "Combined replacement plan" })).toBeInTheDocument();
    expect(screen.getByText("Original Player → Replacement Player")).toBeInTheDocument();
    expect(screen.getByText("Other Starter → Other Replacement")).toBeInTheDocument();
    expect(screen.getByText(/with the other selected changes kept in place/)).toBeInTheDocument();
    expect(screen.getByText("25.0% of clip")).toBeInTheDocument();
    expect(screen.getByText("40.0% of clip")).toBeInTheDocument();
    expect(screen.queryByText(/2500|4000|win probability/i)).not.toBeInTheDocument();
  });

  it("waits for the selected match instead of displaying another match's decision", () => {
    setReport(report({ matchId: "previous-match" }));
    render(<SimulationCoaching variant="coach" />);

    expect(screen.getByRole("status")).toHaveTextContent("Comparing replacement options…");
    expect(
      screen.queryByRole("heading", { name: "Test Replacement Player for Original Player" }),
    ).not.toBeInTheDocument();
  });
});
