// Sport configuration system. All sport-specific behavior (terminology, clocks,
// surfaces, data sources) lives here — components read config, never hardcode.
export type SportId = "football" | "basketball" | "hockey" | "handball" | "volleyball";

export type DataSource = { name: string; status: "integrated" | "demo" };

export type SportConfig = {
  id: SportId;
  name: string;
  icon: string;
  surfaceType: string; // "pitch" | "court" | "rink"
  surfaceLabel: string;
  playersPerTeam: number;
  positions: string[];
  periods: string;
  periodLabel: string; // "Half" | "Quarter" | "Period" | "Set"
  maxTime: number; // timeline axis max (minutes / rallies)
  scoringRules: string;
  supportedEvents: string[];
  scoutingMetrics: string[];
  momentumStrategy: { label: string; drivers: string[] };
  simulationStrategy: string;
  dataSources: DataSource[];
  lateralityLabel: string; // "foot" | "hand" | "shot"
  contribLabel: string; // "G + A" | "Pts + Ast"
  ballLabel: string; // "Ball" | "Puck"
  ghostFrom: number; // timeline point where the ghost branch starts
  formatClock: (t: number, base: number) => string;
  axisTick: (v: number) => string;
};

const mmss = (totalSec: number) =>
  `${Math.floor(totalSec / 60)}:${String(Math.floor(totalSec % 60)).padStart(2, "0")}`;

export const sports: Record<SportId, SportConfig> = {
  football: {
    id: "football",
    name: "Football",
    icon: "⚽",
    surfaceType: "pitch",
    surfaceLabel: "Pitch",
    playersPerTeam: 11,
    positions: ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"],
    periods: "2 × 45 min",
    periodLabel: "Half",
    maxTime: 90,
    scoringRules: "Goal = 1 point; most goals wins.",
    supportedEvents: ["Goal", "Shot", "Turnover", "Interception", "Dangerous pass", "Press"],
    scoutingMetrics: [
      "Passing",
      "Acceleration",
      "Positioning",
      "Interceptions",
      "Progressive actions",
      "Shooting",
      "Defensive contribution",
      "Tactical awareness",
    ],
    momentumStrategy: {
      label: "Attacking pressure model",
      drivers: ["Expected threat", "Dangerous passes", "Shots", "Possession changes", "Field tilt"],
    },
    simulationStrategy: "11v11 tracking-based scenario model (500 runs per scenario).",
    dataSources: [
      { name: "Metrica Sports", status: "integrated" },
      { name: "StatsBomb", status: "integrated" },
      { name: "Wyscout", status: "integrated" },
      { name: "SkillCorner", status: "integrated" },
    ],
    lateralityLabel: "foot",
    contribLabel: "G + A",
    ballLabel: "Ball",
    ghostFrom: 68,
    formatClock: (t, base) =>
      `${base - 1}:${String(Math.max(0, Math.floor(t * 54))).padStart(2, "0")}`,
    axisTick: (v) => (Number.isInteger(v) ? `${v}'` : mmss(v * 60)),
  },
  basketball: {
    id: "basketball",
    name: "Basketball",
    icon: "🏀",
    surfaceType: "court",
    surfaceLabel: "Court",
    playersPerTeam: 5,
    positions: ["PG", "SG", "SF", "PF", "C"],
    periods: "4 × 12 min",
    periodLabel: "Quarter",
    maxTime: 48,
    scoringRules: "2/3 points per field goal, 1 per free throw.",
    supportedEvents: ["Scoring run", "Shot", "Turnover", "Steal", "Offensive rebound", "Timeout"],
    scoutingMetrics: [
      "Shooting efficiency",
      "Assists",
      "Rebounds",
      "Steals",
      "Defensive contribution",
      "Spacing",
      "Playmaking",
    ],
    momentumStrategy: {
      label: "Scoring-run model",
      drivers: ["Scoring runs", "Possession efficiency", "Turnovers", "Defensive stops"],
    },
    simulationStrategy: "5v5 possession-based scenario model (synthetic demo engine).",
    dataSources: [{ name: "DEMO / SYNTHETIC DATA", status: "demo" }],
    lateralityLabel: "hand",
    contribLabel: "Pts + Ast",
    ballLabel: "Ball",
    ghostFrom: 38,
    formatClock: (t, base) => {
      const total = base * 60 + t * 24;
      const q = Math.min(4, Math.floor(total / 720) + 1);
      return `Q${q} ${mmss(total % 720)}`;
    },
    axisTick: (v) => `Q${Math.min(4, Math.floor(v / 12) + 1)}`,
  },
  hockey: {
    id: "hockey",
    name: "Ice Hockey",
    icon: "🏒",
    surfaceType: "rink",
    surfaceLabel: "Rink",
    playersPerTeam: 6,
    positions: ["G", "D", "C", "LW", "RW"],
    periods: "3 × 20 min",
    periodLabel: "Period",
    maxTime: 60,
    scoringRules: "Goal = 1 point; most goals wins.",
    supportedEvents: ["Goal", "Shot", "Scoring chance", "Save", "Turnover", "Power play"],
    scoutingMetrics: [
      "Skating",
      "Passing",
      "Shooting",
      "Puck control",
      "Defensive positioning",
      "Faceoffs",
      "Puck recovery",
    ],
    momentumStrategy: {
      label: "Offensive-zone pressure model",
      drivers: ["Shots", "Scoring chances", "Offensive-zone time", "Puck possession", "Goals"],
    },
    simulationStrategy: "6v6 rink-based scenario model (synthetic demo engine).",
    dataSources: [{ name: "DEMO / SYNTHETIC DATA", status: "demo" }],
    lateralityLabel: "shot",
    contribLabel: "G + A",
    ballLabel: "Puck",
    ghostFrom: 47,
    formatClock: (t, base) => {
      const total = base * 60 + t * 30;
      const p = Math.min(3, Math.floor(total / 1200) + 1);
      return `P${p} ${mmss(total % 1200)}`;
    },
    axisTick: (v) => `P${Math.min(3, Math.floor(v / 20) + 1)}`,
  },
  handball: {
    id: "handball",
    name: "Handball",
    icon: "🤾",
    surfaceType: "court",
    surfaceLabel: "Court",
    playersPerTeam: 7,
    positions: ["GK", "LW", "RW", "LB", "RB", "CB", "P"],
    periods: "2 × 30 min",
    periodLabel: "Half",
    maxTime: 60,
    scoringRules: "Goal = 1 point; most goals wins.",
    supportedEvents: ["Goal", "Shot", "Save", "Turnover", "Fast break", "7m penalty"],
    scoutingMetrics: [
      "Shooting accuracy",
      "Passing",
      "Defensive coverage",
      "Positioning",
      "Speed",
      "Goalkeeper performance",
    ],
    momentumStrategy: {
      label: "Scoring-run + save model",
      drivers: ["Scoring runs", "Shooting efficiency", "Turnovers", "Saves", "Fast breaks"],
    },
    simulationStrategy: "7v7 court-based scenario model (synthetic demo engine).",
    dataSources: [{ name: "DEMO / SYNTHETIC DATA", status: "demo" }],
    lateralityLabel: "hand",
    contribLabel: "Goals",
    ballLabel: "Ball",
    ghostFrom: 44,
    formatClock: (t, base) =>
      `${base - 1}:${String(Math.max(0, Math.floor(t * 45))).padStart(2, "0")}`,
    axisTick: (v) => `${v}'`,
  },
  volleyball: {
    id: "volleyball",
    name: "Volleyball",
    icon: "🏐",
    surfaceType: "court",
    surfaceLabel: "Court",
    playersPerTeam: 6,
    positions: ["OH", "MB", "S", "OP", "L"],
    periods: "Best of 5 sets",
    periodLabel: "Set",
    maxTime: 75,
    scoringRules: "Sets to 25 (win by 2); best of 5.",
    supportedEvents: ["Point run", "Ace", "Block", "Kill", "Side-out", "Reception break"],
    scoutingMetrics: [
      "Serving",
      "Receiving",
      "Setting",
      "Attacking",
      "Blocking",
      "Digging",
      "Positional compatibility",
    ],
    momentumStrategy: {
      label: "Rally-outcome model",
      drivers: [
        "Consecutive points",
        "Side-out efficiency",
        "Serving runs",
        "Blocks",
        "Rally outcomes",
      ],
    },
    simulationStrategy: "6v6 rotation-aware scenario model (synthetic demo engine).",
    dataSources: [{ name: "DEMO / SYNTHETIC DATA", status: "demo" }],
    lateralityLabel: "hand",
    contribLabel: "Pts",
    ballLabel: "Ball",
    ghostFrom: 52,
    formatClock: (t, base) => {
      const rally = base + Math.floor(t * 6);
      return `Set ${Math.min(5, Math.floor(rally / 25) + 1)} · rally ${rally % 25}`;
    },
    axisTick: (v) => `S${Math.min(5, Math.floor(v / 25) + 1)}`,
  },
};

export const sportList = Object.values(sports);
