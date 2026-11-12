// Simulation API service layer. Contracts match the future GhostXI backend;
// the mock adapter below is deterministic and always labeled as demo data.
// Swap createMockApi for an HTTP adapter once the real endpoints exist:
//   GET  /api/matches/:matchId/lineup
//   GET  /api/matches/:matchId/moments?playerId=ID&limit=5
//   GET  /api/candidates?matchId=ID&replacePlayerId=ID
//   GET  /api/scenarios  ·  GET /api/scenarios/:id
//   POST /api/scenarios  ·  POST /api/scenarios/:id/simulate
import { getDataset, type SportDataset } from "./sport-data";
import { hashSeed, squads, type SquadPlayer } from "./squad-data";
import type { SportId } from "./sports";
import type { Player } from "./mock-data";

// ------------------------------------------------------------ Contracts
export type DataStatus = "observed" | "estimated" | "simulated";

export interface RecommendedMoment {
  id: string;
  matchId: string;
  timeSec: number;
  title: string;
  description: string;
  momentumDelta: number;
  relevanceScore: number;
  relevanceReasons: string[];
  position: string;
  dataStatus: DataStatus;
  dataCoverage: number;
}

export interface ReplacementCandidate {
  id: string;
  name: string;
  position: string;
  secondaryPositions: string[];
  source: "bench" | "scouting";
  attributes: Record<string, number | null>;
  positionFit: number | null;
  dataCoverage: number;
}

export interface SimulationScenario {
  id: string;
  sportId: string;
  matchId: string;
  momentId: string;
  originalPlayerId: string;
  candidatePlayerId: string;
  seed: number;
}

export interface SimulationFrame {
  timeSec: number;
  ball: { x: number; y: number };
  players: Record<string, { x: number; y: number }>;
}

export interface ComparisonMetric {
  label: string;
  original: string;
  ghost: string;
  better: boolean;
  dataStatus: DataStatus;
}

export interface SimulationResult {
  scenarioId: string;
  status: "completed" | "failed";
  originalFrames: SimulationFrame[];
  alternativeFrames: SimulationFrame[];
  metrics: { originalValue: number | null; alternativeValue: number | null; delta: number | null };
  breakdown: ComparisonMetric[];
  explanations: string[];
  coaching: string[];
  limitations: string[];
  dataCoverage: number;
}

export interface SimApi {
  isDemo: boolean;
  getLineup(matchId: string): Promise<{ starting: SquadPlayer[]; bench: SquadPlayer[] }>;
  getMoments(matchId: string, playerId: string, limit?: number): Promise<RecommendedMoment[]>;
  getCandidates(matchId: string, replacePlayerId: string): Promise<ReplacementCandidate[]>;
  listScenarios(): Promise<SimulationScenario[]>;
  createScenario(input: Omit<SimulationScenario, "id" | "seed">): Promise<SimulationScenario>;
  duplicateScenario(id: string): Promise<SimulationScenario | null>;
  deleteScenario(id: string): Promise<void>;
  simulate(scenario: SimulationScenario): Promise<SimulationResult>;
}

// ------------------------------------------------------------ Position relevance
// Which event types matter for which position group, per sport.
const RELEVANCE: Record<
  SportId,
  { match: (pos: string) => boolean; types: string[]; reason: string }[]
> = {
  football: [
    {
      match: (p) => ["CM", "DM", "AM"].includes(p),
      types: ["Turnover", "Interception", "Dangerous pass", "Press"],
      reason: "Central midfielders own progression and second-ball phases",
    },
    {
      match: (p) => p === "ST",
      types: ["Shot", "Goal", "Dangerous pass"],
      reason: "Strikers are judged on finishing and attacking positioning",
    },
    {
      match: (p) => p === "CB",
      types: ["Dangerous pass", "Goal", "Turnover"],
      reason: "Centre-backs are responsible for the space this event attacked",
    },
    {
      match: (p) => ["RW", "LW"].includes(p),
      types: ["Turnover", "Shot", "Press"],
      reason: "Wide players own flank transitions and recovery runs",
    },
    {
      match: (p) => ["RB", "LB"].includes(p),
      types: ["Turnover", "Dangerous pass", "Goal"],
      reason: "Full-backs own the wide channel this event exploited",
    },
    {
      match: (p) => p === "GK",
      types: ["Goal", "Shot"],
      reason: "Goalkeeper involvement in shot-stopping phases",
    },
  ],
  basketball: [
    {
      match: (p) => ["PG", "SG"].includes(p),
      types: ["Turnover", "Steal", "Scoring run"],
      reason: "Guards own press-breaking and perimeter defense",
    },
    {
      match: (p) => p === "SF",
      types: ["Turnover", "Shot", "Scoring run"],
      reason: "Wings own weak-side defense and spot-up phases",
    },
    {
      match: (p) => ["PF", "C"].includes(p),
      types: ["Offensive rebound", "Shot", "Scoring run"],
      reason: "Bigs own the paint and second-chance phases",
    },
  ],
  hockey: [
    {
      match: (p) => p === "D",
      types: ["Turnover", "Goal", "Scoring chance"],
      reason: "Defensemen own gap control and rush prevention",
    },
    {
      match: (p) => ["C", "LW", "RW"].includes(p),
      types: ["Turnover", "Goal", "Power play"],
      reason: "Forwards own forecheck and cover responsibilities",
    },
    {
      match: (p) => p === "G",
      types: ["Goal", "Save", "Scoring chance"],
      reason: "Goaltender involvement in shot phases",
    },
  ],
  handball: [
    {
      match: (p) => ["LB", "RB", "CB"].includes(p),
      types: ["Turnover", "Goal", "Scoring run"],
      reason: "Backs own the 9m line and 6m line integrity",
    },
    {
      match: (p) => ["LW", "RW"].includes(p),
      types: ["Goal", "Fast break", "Shot"],
      reason: "Wings own finishing and fast-break phases",
    },
    {
      match: (p) => p === "P",
      types: ["Goal", "Turnover"],
      reason: "Pivot owns the 6m line duels",
    },
    {
      match: (p) => p === "GK",
      types: ["Save", "Goal", "7m penalty"],
      reason: "Goalkeeper involvement in shot phases",
    },
  ],
  volleyball: [
    {
      match: (p) => p === "L",
      types: ["Reception break", "Ace", "Point run"],
      reason: "Liberos own reception seams and first contact",
    },
    {
      match: (p) => ["OH", "OP"].includes(p),
      types: ["Kill", "Side-out", "Reception break"],
      reason: "Pin hitters own side-out and attack phases",
    },
    {
      match: (p) => p === "MB",
      types: ["Block", "Kill", "Point run"],
      reason: "Middles own net defense and first-tempo attack",
    },
    {
      match: (p) => p === "S",
      types: ["Side-out", "Point run", "Ace"],
      reason: "Setters own distribution quality in every rally",
    },
  ],
};

function relevanceFor(sportId: SportId, position: string) {
  const rules = RELEVANCE[sportId];
  return (
    rules.find((r) => r.match(position)) ?? {
      match: () => true,
      types: [],
      reason: "General squad relevance",
    }
  );
}

// ------------------------------------------------------------ Saved scenarios (localStorage)
const STORE_KEY = "ghostxi-scenarios";

function loadScenarios(): SimulationScenario[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as SimulationScenario[];
  } catch {
    return [];
  }
}
function saveScenarios(list: SimulationScenario[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

// ------------------------------------------------------------ Mock adapter
const delay = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

export function createMockApi(sportId: SportId): SimApi {
  const dataset: SportDataset = getDataset(sportId);
  const squad = squads[sportId];

  const toCandidate = (
    p: SquadPlayer,
    source: "bench" | "scouting",
    replacePos: string,
  ): ReplacementCandidate => ({
    id: p.id,
    name: p.name,
    position: p.position,
    secondaryPositions: p.secondaryPositions,
    source,
    attributes: p.attributes,
    positionFit: positionFit(p.position, p.secondaryPositions, replacePos, p.id),
    dataCoverage: p.coverage,
  });

  return {
    isDemo: true,

    async getLineup() {
      await delay();
      return squad;
    },

    async getMoments(matchId, playerId, limit = 5) {
      await delay();
      const player = [...squad.starting, ...squad.bench].find((p) => p.id === playerId);
      const position = player?.position ?? "CM";
      const rule = relevanceFor(sportId, position);
      return dataset.moments
        .map((m) => {
          const typeHit = rule.types.includes(m.type) ? 1 : 0;
          const relevanceScore =
            Math.round(
              (typeHit * 55 + Math.abs(m.impact) * 0.9 + hashSeed(`${playerId}:${m.id}`) * 10) * 10,
            ) / 10;
          const reasons = [
            rule.reason,
            `Momentum swing of ${m.impact > 0 ? "+" : ""}${m.impact} — one of the largest in the match`,
            typeHit
              ? `Event type "${m.type}" sits in the ${position} responsibility zone`
              : `Large momentum event near the ${position} zone`,
          ];
          return {
            id: `rm-${m.id}`,
            matchId,
            timeSec: m.minute * 60,
            title: m.title,
            description: m.description,
            momentumDelta: m.impact,
            relevanceScore,
            relevanceReasons: reasons,
            position,
            dataStatus: m.kind,
            dataCoverage: dataset.match.coverage,
          } satisfies RecommendedMoment;
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, Math.max(3, Math.min(5, limit)));
    },

    async getCandidates(_matchId, replacePlayerId) {
      await delay();
      const replaced = [...squad.starting, ...squad.bench].find((p) => p.id === replacePlayerId);
      const replacePos = replaced?.position ?? "";
      const bench = squad.bench
        .filter((p) => p.id !== replacePlayerId)
        .map((p) => toCandidate(p, "bench", replacePos));
      const scouting = dataset.candidates.map((c: Player) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        secondaryPositions: c.roles.map((r) => r.role),
        source: "scouting" as const,
        attributes: Object.fromEntries(c.radar.map((r) => [r.metric, r.value])),
        positionFit: positionFit(c.position, [], replacePos, c.id),
        dataCoverage: c.coverage,
      }));
      return [...bench, ...scouting].sort((a, b) => (b.positionFit ?? 0) - (a.positionFit ?? 0));
    },

    async listScenarios() {
      await delay();
      return loadScenarios().filter((s) => s.sportId === sportId);
    },

    async createScenario(input) {
      await delay();
      const scenario: SimulationScenario = {
        ...input,
        id: `sc-${Date.now().toString(36)}-${Math.round(hashSeed(input.candidatePlayerId + input.momentId) * 1e6).toString(36)}`,
        seed: Math.round(
          hashSeed(`${input.originalPlayerId}:${input.candidatePlayerId}:${input.momentId}`) * 1e9,
        ),
      };
      saveScenarios([...loadScenarios(), scenario]);
      return scenario;
    },

    async duplicateScenario(id) {
      await delay();
      const all = loadScenarios();
      const src = all.find((s) => s.id === id);
      if (!src) return null;
      const copy: SimulationScenario = {
        ...src,
        id: `sc-${Date.now().toString(36)}-dup`,
        seed: src.seed + 1,
      };
      saveScenarios([...all, copy]);
      return copy;
    },

    async deleteScenario(id) {
      await delay();
      saveScenarios(loadScenarios().filter((s) => s.id !== id));
    },

    async simulate(scenario) {
      await delay();
      const moment = dataset.moments.find(
        (m) => `rm-${m.id}` === scenario.momentId || String(m.id) === scenario.momentId,
      );
      const candidate = dataset.candidates.find((c) => c.id === scenario.candidatePlayerId);
      const replaced = [...squad.starting, ...squad.bench].find(
        (p) => p.id === scenario.originalPlayerId,
      );
      const h = (salt: string) => hashSeed(`${scenario.seed}:${salt}`);

      // Possession value: original baseline vs. candidate-adjusted alternative.
      const originalValue = Math.round((0.15 + h("ov") * 0.35) * 100) / 100;
      const fitBoost = ((candidate?.fit ?? 70) - 60) / 100;
      const alternativeValue =
        Math.round(Math.max(0.02, originalValue - 0.05 - fitBoost * 0.4 - h("av") * 0.1) * 100) /
        100;

      const cov = candidate?.coverage ?? replaced?.coverage ?? dataset.match.coverage;
      const name = candidate?.name ?? "the candidate";
      const pos = replaced?.position ?? candidate?.position ?? "player";

      const breakdown: ComparisonMetric[] = [
        {
          label: "Positioning score",
          original: String(Math.round(45 + h("po") * 20)),
          ghost: String(Math.round(68 + h("pg") * 24)),
          better: true,
          dataStatus: "simulated",
        },
        {
          label: "Ball reception / interception",
          original: `${(1.4 + h("ro") * 1.6).toFixed(1)}s`,
          ghost: `${(0.8 + h("rg") * 0.9).toFixed(1)}s`,
          better: true,
          dataStatus: "simulated",
        },
        {
          label: "Passing decision quality",
          original: `${Math.round(52 + h("po2") * 18)}%`,
          ghost: `${Math.round(70 + h("pg2") * 22)}%`,
          better: true,
          dataStatus: "estimated",
        },
        {
          label: "Possession value",
          original: originalValue.toFixed(2),
          ghost: alternativeValue.toFixed(2),
          better: alternativeValue < originalValue,
          dataStatus: "simulated",
        },
        {
          label: "Tactical compatibility",
          original: "—",
          ghost: `${candidate?.fit ?? 70}/100`,
          better: true,
          dataStatus: "estimated",
        },
      ];

      return {
        scenarioId: scenario.id,
        status: "completed",
        originalFrames: buildFrames(dataset, false),
        alternativeFrames: buildFrames(dataset, true),
        metrics: {
          originalValue,
          alternativeValue,
          delta: Math.round((alternativeValue - originalValue) * 100) / 100,
        },
        breakdown,
        explanations: [
          `${name} holds a ${(1.5 + h("e1") * 3).toFixed(1)}m better average distance to the danger zone than the original ${pos} in this sequence.`,
          `The alternative branch starts the recovery action ${(0.6 + h("e2") * 1.4).toFixed(1)}s earlier, before the pass is played.`,
          `Modeled possession value changes from ${originalValue.toFixed(2)} to ${alternativeValue.toFixed(2)} across ${Math.round(300 + h("e3") * 400)} simulation runs.`,
        ],
        coaching: [
          `Coach the loss-trigger reaction: the first two steps after the turnover decide this sequence.`,
          `Review the ${pos} positioning rule for this phase with the whole unit, not only the individual.`,
        ],
        limitations: [
          "Demo adapter: movement branches are pre-authored fixtures, not a live physics engine.",
          `Data coverage for this candidate is ${Math.round(cov * 100)}% — treat the delta as directional.`,
        ],
        dataCoverage: cov,
      };
    },
  };
}

function positionFit(pos: string, secondary: string[], replacePos: string, id: string): number {
  const jitter = Math.round(hashSeed(`fit:${id}:${replacePos}`) * 8);
  if (pos === replacePos) return 86 + jitter;
  if (secondary.includes(replacePos)) return 66 + jitter;
  return 42 + jitter; // experimental override
}

// Frames in the normalized 0–100 coordinate system, sampled from the dataset fixtures.
function buildFrames(dataset: SportDataset, ghost: boolean): SimulationFrame[] {
  const frames: SimulationFrame[] = [];
  const steps = 12;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const players: Record<string, { x: number; y: number }> = {};
    for (const p of dataset.fieldPlayers) {
      if (p.role === "ghost" && !ghost) continue;
      if (p.role === "original" && ghost) continue;
      const pos = sample(p.frames, t);
      players[p.id] = { x: Math.round(pos[0] / 1.05) / 1, y: Math.round(pos[1] / 0.68) / 1 };
    }
    const ball = sample(ghost ? dataset.ballFrames.ghost : dataset.ballFrames.original, t);
    frames.push({
      timeSec: Math.round(t * 8 * 10) / 10,
      ball: { x: Math.round(ball[0] / 1.05), y: Math.round(ball[1] / 0.68) },
      players,
    });
  }
  return frames;
}

function sample(frames: [number, number][], t: number): [number, number] {
  const max = frames.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * max;
  const i = Math.min(Math.floor(x), max - 1);
  const k = x - i;
  const a = frames[i]!,
    b = frames[i + 1]!;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
