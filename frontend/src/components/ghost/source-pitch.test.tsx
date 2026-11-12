import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcePitch } from "./source-pitch";
import type {
  ReplayMatch,
  VerifiedReplayPlayer,
  TrackingFrame,
  SimulationFrame,
} from "@/lib/backend/ghostxi";

afterEach(cleanup);
const roster: VerifiedReplayPlayer[] = [
  {
    id: "Player2",
    providerId: "Player2",
    name: "Home 2",
    position: null,
    secondaryPositions: [],
    teamId: "HOME",
    source: "metrica",
    isStarter: true,
    dateOfBirth: null,
  },
  {
    id: "Player15",
    providerId: "Player15",
    name: "Away 15",
    position: null,
    secondaryPositions: [],
    teamId: "AWAY",
    source: "metrica",
    isStarter: true,
    dateOfBirth: null,
  },
];
const match: ReplayMatch & { players: VerifiedReplayPlayer[] } = {
  id: "metrica-game-1",
  provider: "metrica",
  providerId: "1",
  name: "Source recording",
  date: null,
  teams: [
    { id: "HOME", providerId: "Home", name: "Home" },
    { id: "AWAY", providerId: "Away", name: "Away" },
  ],
  score: null,
  pitch: { length: 105, width: 68 },
  fps: 25,
  playable: true,
  trackingStatus: ["OBSERVED"],
  coverage: {
    playable: true,
    frameCount: 1,
    status: "validated",
    missingBall: 0,
    missingPlayerValues: 0,
    segments: [],
    gaps: [],
    bosniaBlocked: false,
  },
  source: { name: "Metrica", url: "https://github.com/metrica-sports/sample-data" },
  limitations: [],
  players: roster,
};
const source: TrackingFrame = {
  sourceFrame: 251,
  period: 1,
  periodTimeSec: 10.04,
  dataStatus: "OBSERVED",
  ball: { x: 50, y: 50 },
  players: { Player2: { x: 20, y: 30 }, Player15: { x: 70, y: 40 } },
  quality: {},
};
const alternative: SimulationFrame = {
  timeSec: 0,
  ball: source.ball!,
  players: { "statsbomb:22084": { x: 22, y: 31 }, Player15: { x: 70, y: 40 } },
};
const common = {
  match,
  source,
  alternative,
  sourceFrames: [source],
  alternativeFrames: [alternative],
  swaps: [{ originalPlayerId: "Player2", candidatePlayerId: "statsbomb:22084" }],
  names: { "statsbomb:22084": "Bukayo Saka" },
  selected: "Player2",
  time: 0,
  duration: 8,
  onSelect: vi.fn(),
  label: "Verified pitch",
};

describe("Lovable field with backend source frames", () => {
  it("retains labels, shadows and stadium styling while using exact recorded coordinates", () => {
    const { container } = render(<SourcePitch {...common} mode="original" />);
    const player = screen.getByRole("button", { name: "Select Home 2" });
    expect(player.getAttribute("transform")).toBe("translate(21 20.400000000000002)");
    expect(screen.queryByRole("button", { name: "Select Bukayo Saka" })).toBeNull();
    expect(container.querySelector("svg")?.classList.contains("stand-ring")).toBe(true);
    expect(container.querySelector("filter#shadow")).not.toBeNull();
    expect(player.textContent).toContain("Home 2");
  });
  it("replaces the original in the alternative and keeps the outgoing jersey and selectable identity", () => {
    render(<SourcePitch {...common} mode="ghost" />);
    expect(screen.queryByRole("button", { name: "Select Home 2" })).toBeNull();
    const ghost = screen.getByRole("button", { name: "Select Bukayo Saka" });
    expect(ghost.textContent).toContain("2");
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.keyDown(ghost, { key: "Enter" });
    expect(common.onSelect).toHaveBeenCalledWith("Player2");
  });
  it("preserves missing observations instead of drawing made-up source positions", () => {
    render(
      <SourcePitch
        {...common}
        source={{ ...source, players: { ...source.players, Player2: null } }}
        mode="original"
      />,
    );
    expect(screen.queryByRole("button", { name: "Select Home 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select Away 15" })).toBeTruthy();
  });
  it("renders an explicit empty source state in a tracking gap", () => {
    render(<SourcePitch {...common} source={null} mode="original" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("No source frame available")).toBeTruthy();
  });
});
