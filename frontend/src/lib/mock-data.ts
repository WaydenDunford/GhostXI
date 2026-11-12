// Mock data layer. Replace these exports with API-backed fetchers later; shapes are the contract.
export type DataKind = "observed" | "estimated" | "simulated";
export type Verdict =
  | "Must-have candidate"
  | "Strong prospect"
  | "Possible fit"
  | "Low fit"
  | "Not assessed"
  | "Review candidate";

export const match = {
  id: "m-2024-sar-zel",
  competition: "Premijer Liga BiH · Round 14",
  date: "3 Nov 2024",
  venue: "Asim Ferhatović Hase",
  home: { name: "FK Sarajevo", short: "SAR", score: 1, formation: "4-3-3" },
  away: { name: "FK Željezničar", short: "ZEL", score: 2, formation: "4-2-3-1" },
  attendance: "21,340",
  coverage: 0.82,
};

export type Moment = {
  id: number;
  backendId?: string;
  elapsedMinute?: number;
  impactLabel?: string;
  minute: number;
  title: string;
  team: "home" | "away";
  type: string; // event vocabulary is sport-specific; see sports.ts supportedEvents
  impact: number;
  kind: DataKind;
  description: string;
};

export const moments: Moment[] = [
  {
    id: 1,
    minute: 12,
    title: "High press forces turnover",
    team: "home",
    type: "Press",
    impact: 18,
    kind: "observed",
    description: "Sarajevo's front three trap the left back; ball won 32m from goal.",
  },
  {
    id: 2,
    minute: 23,
    title: "Goal — Hodžić header",
    team: "home",
    type: "Goal",
    impact: 34,
    kind: "observed",
    description: "Far-post header from an overlapping right-back cross.",
  },
  {
    id: 3,
    minute: 31,
    title: "Lost duel in midfield",
    team: "away",
    type: "Turnover",
    impact: -21,
    kind: "observed",
    description: "No. 8 caught on the half-turn; Željo break through the half-space.",
  },
  {
    id: 4,
    minute: 38,
    title: "Through ball splits CB pair",
    team: "away",
    type: "Dangerous pass",
    impact: -26,
    kind: "estimated",
    description: "Gap of 11m between centre-backs exploited; positions partly reconstructed.",
  },
  {
    id: 5,
    minute: 44,
    title: "Interception at edge of box",
    team: "home",
    type: "Interception",
    impact: 12,
    kind: "observed",
    description: "DM reads the cut-back lane and resets possession.",
  },
  {
    id: 6,
    minute: 52,
    title: "Goal — Begić equaliser",
    team: "away",
    type: "Goal",
    impact: -38,
    kind: "observed",
    description: "Late arrival into the box unmarked; RW failed to track back.",
  },
  {
    id: 7,
    minute: 61,
    title: "Missed 1v1 chance",
    team: "home",
    type: "Shot",
    impact: 15,
    kind: "observed",
    description: "Striker through on goal, shot saved low to the left.",
  },
  {
    id: 8,
    minute: 68,
    title: "RW positional error",
    team: "home",
    type: "Turnover",
    impact: -29,
    kind: "estimated",
    description: "Original RW drifts inside, leaving the flank open. Ghost scenario anchor.",
  },
  {
    id: 9,
    minute: 74,
    title: "Goal — Mujkić winner",
    team: "away",
    type: "Goal",
    impact: -41,
    kind: "observed",
    description: "Counter down the exposed right channel; finish at near post.",
  },
  {
    id: 10,
    minute: 86,
    title: "Late siege, 3 shots in 90s",
    team: "home",
    type: "Shot",
    impact: 19,
    kind: "observed",
    description: "Sustained pressure but low xG per shot (0.06 avg).",
  },
];

export const momentumSeries = Array.from({ length: 46 }, (_, i) => {
  const minute = i * 2;
  const base = Math.sin(minute / 9) * 30 + Math.cos(minute / 4) * 12;
  const m = moments.find((x) => Math.abs(x.minute - minute) <= 1);
  const v = Math.max(-80, Math.min(80, Math.round(base + (m ? m.impact : 0))));
  const ghost = minute >= 68 ? Math.min(80, v + 22 + Math.round(Math.sin(minute) * 4)) : v;
  return { minute, momentum: v, ghost };
});

export type Player = {
  id: string;
  name: string;
  age: number | null;
  position: string;
  foot: "Left" | "Right" | "Both" | "Unavailable";
  team: string;
  nationality: string;
  style: string;
  coverage: number;
  fit: number | null;
  verdict: Verdict;
  summary: string;
  styleSummary: string;
  strengths: string[];
  weaknesses: string[];
  roles: { role: string; score: number }[];
  radar: { metric: string; value: number }[];
  stats: { label: string; value: number; per90: string }[];
  why: string;
};

export const candidates: Player[] = [
  {
    id: "p1",
    name: "Amar Kovačević",
    age: 19,
    position: "RW",
    foot: "Left",
    team: "FK Velež U21",
    nationality: "Bosnia & Herzegovina",
    style: "Inverted winger",
    coverage: 0.86,
    fit: 87,
    verdict: "Must-have candidate",
    summary:
      "Explosive left-footed winger with elite recovery runs for his age and strong decision-making in transition.",
    styleSummary:
      "Holds width early, attacks the half-space late. Tracks back aggressively when possession is lost.",
    strengths: [
      "Defensive recovery speed",
      "1v1 dribbling",
      "Final-third decision timing",
      "Pressing triggers",
    ],
    weaknesses: ["Aerial duels", "Weak foot crossing", "Physical strength vs. senior FBs"],
    roles: [
      { role: "Inverted winger", score: 91 },
      { role: "Wide forward", score: 84 },
      { role: "Wing-back", score: 66 },
    ],
    radar: [
      { metric: "Pace", value: 92 },
      { metric: "Dribbling", value: 85 },
      { metric: "Passing", value: 74 },
      { metric: "Defending", value: 71 },
      { metric: "Finishing", value: 68 },
      { metric: "Awareness", value: 82 },
    ],
    stats: [
      { label: "Progressive carries", value: 88, per90: "6.4" },
      { label: "Recoveries in opp. half", value: 79, per90: "3.1" },
      { label: "xA", value: 72, per90: "0.21" },
      { label: "Duels won", value: 58, per90: "47%" },
    ],
    why: "Sarajevo concede 38% of chances through the right channel. Kovačević's recovery speed and positional discipline directly address the 68' failure mode, while his inverted runs suit the 4-3-3 overload pattern.",
  },
  {
    id: "p2",
    name: "Luka Perić",
    age: 20,
    position: "CM",
    foot: "Right",
    team: "NK Široki Brijeg",
    nationality: "Croatia",
    style: "Box-to-box",
    coverage: 0.74,
    fit: 76,
    verdict: "Strong prospect",
    summary: "Tireless box-to-box midfielder who wins second balls and links lines quickly.",
    styleSummary: "Vertical passer, arrives late in the box, presses in short bursts.",
    strengths: ["Second-ball wins", "Vertical passing", "Stamina"],
    weaknesses: ["Press resistance", "Discipline (cards)"],
    roles: [
      { role: "Box-to-box", score: 82 },
      { role: "Mezzala", score: 77 },
      { role: "Holding mid", score: 61 },
    ],
    radar: [
      { metric: "Pace", value: 70 },
      { metric: "Dribbling", value: 64 },
      { metric: "Passing", value: 81 },
      { metric: "Defending", value: 75 },
      { metric: "Finishing", value: 60 },
      { metric: "Awareness", value: 73 },
    ],
    stats: [
      { label: "Progressive passes", value: 81, per90: "7.9" },
      { label: "Ball recoveries", value: 77, per90: "8.2" },
      { label: "xA", value: 55, per90: "0.11" },
      { label: "Duels won", value: 66, per90: "54%" },
    ],
    why: "Adds legs and verticality to a midfield that lost 9 second balls in the 31'–52' momentum dip.",
  },
  {
    id: "p3",
    name: "Emir Halilović",
    age: 18,
    position: "ST",
    foot: "Right",
    team: "FK Sloboda",
    nationality: "Bosnia & Herzegovina",
    style: "Pressing forward",
    coverage: 0.58,
    fit: 64,
    verdict: "Possible fit",
    summary: "Raw, energetic striker with high pressing output and good movement across the line.",
    styleSummary: "Channel runner, triggers the press, still developing hold-up play.",
    strengths: ["Pressing volume", "Movement off the ball"],
    weaknesses: ["Finishing consistency", "Hold-up play", "Limited data sample"],
    roles: [
      { role: "Pressing forward", score: 74 },
      { role: "Target man", score: 48 },
      { role: "False 9", score: 55 },
    ],
    radar: [
      { metric: "Pace", value: 80 },
      { metric: "Dribbling", value: 60 },
      { metric: "Passing", value: 52 },
      { metric: "Defending", value: 58 },
      { metric: "Finishing", value: 63 },
      { metric: "Awareness", value: 66 },
    ],
    stats: [
      { label: "Pressures", value: 84, per90: "22.1" },
      { label: "xG", value: 57, per90: "0.34" },
      { label: "Aerials won", value: 38, per90: "29%" },
      { label: "Shot accuracy", value: 49, per90: "38%" },
    ],
    why: "Fits the pressing identity, but the low data coverage (58%) means this verdict should be revisited.",
  },
  {
    id: "p4",
    name: "Dario Marić",
    age: 21,
    position: "LB",
    foot: "Left",
    team: "HŠK Zrinjski B",
    nationality: "Croatia",
    style: "Overlapping full-back",
    coverage: 0.69,
    fit: 41,
    verdict: "Low fit",
    summary: "Attack-minded full-back with good crossing but frequent positional lapses.",
    styleSummary: "High and wide, crosses early, slow to recover.",
    strengths: ["Crossing volume", "Overlapping runs"],
    weaknesses: ["Recovery pace", "1v1 defending", "Positional discipline"],
    roles: [
      { role: "Wing-back", score: 63 },
      { role: "Full-back", score: 44 },
      { role: "Inverted FB", score: 32 },
    ],
    radar: [
      { metric: "Pace", value: 62 },
      { metric: "Dribbling", value: 58 },
      { metric: "Passing", value: 70 },
      { metric: "Defending", value: 45 },
      { metric: "Finishing", value: 30 },
      { metric: "Awareness", value: 50 },
    ],
    stats: [
      { label: "Crosses", value: 79, per90: "5.6" },
      { label: "Tackles won", value: 41, per90: "1.2" },
      { label: "Dribbled past", value: 28, per90: "1.9" },
      { label: "xA", value: 60, per90: "0.14" },
    ],
    why: "Would amplify rather than fix the current transition vulnerability on the flanks.",
  },
  {
    id: "p5",
    name: "Kenan Selimović",
    age: 19,
    position: "CB",
    foot: "Right",
    team: "FK Borac U21",
    nationality: "Bosnia & Herzegovina",
    style: "Ball-playing CB",
    coverage: 0.79,
    fit: 79,
    verdict: "Strong prospect",
    summary: "Composed centre-back who steps into midfield and covers depth well.",
    styleSummary: "Line-breaking passes, aggressive step-ups, good recovery angles.",
    strengths: ["Line-breaking passes", "Recovery angles", "Composure"],
    weaknesses: ["Aerial timing", "Communication"],
    roles: [
      { role: "Ball-playing CB", score: 84 },
      { role: "Libero", score: 72 },
      { role: "Stopper", score: 63 },
    ],
    radar: [
      { metric: "Pace", value: 74 },
      { metric: "Dribbling", value: 56 },
      { metric: "Passing", value: 83 },
      { metric: "Defending", value: 80 },
      { metric: "Finishing", value: 25 },
      { metric: "Awareness", value: 78 },
    ],
    stats: [
      { label: "Progressive passes", value: 86, per90: "8.8" },
      { label: "Interceptions", value: 72, per90: "2.0" },
      { label: "Aerials won", value: 54, per90: "58%" },
      { label: "Pass accuracy", value: 88, per90: "89%" },
    ],
    why: "Would have closed the 11m CB gap exploited at 38' thanks to better recovery angles.",
  },
];

export const scenarios = [
  { id: "s1", minute: 68, label: "68' — RW positional error (Kovačević in)", ghostId: "p1" },
  { id: "s2", minute: 38, label: "38' — CB gap through ball (Selimović in)", ghostId: "p5" },
  { id: "s3", minute: 31, label: "31' — Midfield duel loss (Perić in)", ghostId: "p2" },
];

// Pitch coordinates in a 105x68 frame. Keyframes for the 68' sequence.
type Pos = [number, number];
export type PitchPlayer = {
  id: string;
  num: number;
  label: string;
  team: "home" | "away";
  frames: Pos[];
  role?: "original" | "ghost";
  pairId?: string;
};

const f = (...p: Pos[]) => p;
export const pitchPlayers: PitchPlayer[] = [
  {
    id: "h1",
    num: 1,
    label: "Kurtović",
    team: "home",
    frames: f([6, 34], [7, 34], [8, 35], [6, 36]),
  },
  {
    id: "h2",
    num: 2,
    label: "Vujić",
    team: "home",
    frames: f([30, 60], [36, 61], [40, 60], [32, 58]),
  },
  {
    id: "h4",
    num: 4,
    label: "Ahmetović",
    team: "home",
    frames: f([28, 42], [30, 42], [28, 44], [22, 44]),
  },
  {
    id: "h5",
    num: 5,
    label: "Lakić",
    team: "home",
    frames: f([28, 26], [30, 26], [27, 27], [21, 29]),
  },
  {
    id: "h3",
    num: 3,
    label: "Ćosić",
    team: "home",
    frames: f([34, 9], [40, 10], [44, 10], [38, 12]),
  },
  {
    id: "h6",
    num: 6,
    label: "Džafić",
    team: "home",
    frames: f([44, 34], [48, 34], [46, 36], [38, 38]),
  },
  {
    id: "h8",
    num: 8,
    label: "Rahmanović",
    team: "home",
    frames: f([54, 44], [58, 42], [55, 44], [46, 46]),
  },
  {
    id: "h10",
    num: 10,
    label: "Tatar",
    team: "home",
    frames: f([56, 22], [62, 24], [64, 26], [56, 28]),
  },
  {
    id: "h11",
    num: 11,
    label: "Beganović",
    team: "home",
    frames: f([70, 10], [76, 12], [78, 14], [70, 16]),
  },
  {
    id: "h9",
    num: 9,
    label: "Hodžić",
    team: "home",
    frames: f([74, 32], [80, 34], [82, 32], [74, 34]),
  },
  {
    id: "h7",
    num: 7,
    label: "Mešić",
    team: "home",
    role: "original",
    frames: f([68, 56], [70, 46], [72, 40], [66, 40]),
  },
  {
    id: "g7",
    num: 7,
    label: "Kovačević",
    team: "home",
    role: "ghost",
    frames: f([68, 56], [66, 58], [58, 58], [44, 56]),
  },
  {
    id: "a1",
    num: 1,
    label: "Pirić",
    team: "away",
    frames: f([99, 34], [98, 34], [97, 33], [98, 34]),
  },
  {
    id: "a2",
    num: 2,
    label: "Hadžić",
    team: "away",
    frames: f([84, 58], [82, 56], [78, 52], [74, 50]),
  },
  {
    id: "a4",
    num: 4,
    label: "Pejić",
    team: "away",
    frames: f([86, 42], [86, 40], [82, 40], [78, 40]),
  },
  {
    id: "a5",
    num: 5,
    label: "Kos",
    team: "away",
    frames: f([86, 26], [86, 28], [82, 28], [78, 30]),
  },
  {
    id: "a3",
    num: 3,
    label: "Mujkić",
    team: "away",
    frames: f([82, 10], [76, 14], [62, 20], [46, 18]),
  },
  {
    id: "a6",
    num: 6,
    label: "Bešić",
    team: "away",
    frames: f([72, 36], [70, 36], [64, 34], [56, 34]),
  },
  {
    id: "a8",
    num: 8,
    label: "Alić",
    team: "away",
    frames: f([70, 24], [66, 22], [58, 26], [50, 28]),
  },
  {
    id: "a10",
    num: 10,
    label: "Begić",
    team: "away",
    frames: f([60, 34], [54, 32], [46, 30], [34, 32]),
  },
  {
    id: "a11",
    num: 11,
    label: "Zec",
    team: "away",
    frames: f([58, 52], [54, 54], [46, 56], [34, 56]),
  },
  {
    id: "a7",
    num: 7,
    label: "Ramić",
    team: "away",
    frames: f([58, 14], [52, 14], [44, 12], [30, 14]),
  },
  {
    id: "a9",
    num: 9,
    label: "Ćurić",
    team: "away",
    frames: f([50, 34], [46, 36], [40, 40], [28, 38]),
  },
];
// Original: ball goes into the open right channel. Ghost: Kovačević blocks it.
export const ballFrames: { original: Pos[]; ghost: Pos[] } = {
  original: [
    [71, 44],
    [66, 22],
    [46, 18],
    [34, 56],
  ],
  ghost: [
    [71, 44],
    [66, 22],
    [58, 26],
    [58, 58],
  ],
};

export const comparison = [
  {
    metric: "Chance conceded (xG against)",
    original: "0.41",
    ghost: "0.07",
    better: true,
    kind: "simulated" as DataKind,
  },
  {
    metric: "Right-channel exposure",
    original: "18m",
    ghost: "4m",
    better: true,
    kind: "estimated" as DataKind,
  },
  {
    metric: "Recovery time",
    original: "4.8s",
    ghost: "2.1s",
    better: true,
    kind: "simulated" as DataKind,
  },
  {
    metric: "Defensive line compactness",
    original: "41m",
    ghost: "33m",
    better: true,
    kind: "estimated" as DataKind,
  },
  {
    metric: "Attacking width after regain",
    original: "62%",
    ghost: "55%",
    better: false,
    kind: "simulated" as DataKind,
  },
];

export const coachInsights = [
  {
    area: "Positioning",
    priority: "High",
    confidence: 0.84,
    kind: "estimated" as DataKind,
    insight:
      "Original RW abandoned the width 6s before the turnover; ghost holds a 12m buffer to the touchline.",
  },
  {
    area: "Timing",
    priority: "High",
    confidence: 0.78,
    kind: "simulated" as DataKind,
    insight:
      "Recovery run must start on the loss trigger, not on the pass — ghost starts 1.4s earlier.",
  },
  {
    area: "Awareness",
    priority: "Medium",
    confidence: 0.71,
    kind: "estimated" as DataKind,
    insight: "Two scans in the 5s before loss vs. zero for the original player.",
  },
  {
    area: "Passing option selection",
    priority: "Medium",
    confidence: 0.66,
    kind: "observed" as DataKind,
    insight:
      "Forced pass inside into a 3v1 zone; a recycle to the RB had 92% completion likelihood.",
  },
  {
    area: "Movement into space",
    priority: "Low",
    confidence: 0.62,
    kind: "simulated" as DataKind,
    insight:
      "Ghost delays inside run until the No. 9 pins the CB, creating a cleaner half-space lane.",
  },
  {
    area: "Defensive recovery",
    priority: "High",
    confidence: 0.88,
    kind: "simulated" as DataKind,
    insight: "Ghost recovery angle cuts the passing lane to Mujkić, reducing xG against by 0.34.",
  },
];

export const verdictTone: Record<Verdict, string> = {
  "Not assessed": "bg-muted text-muted-foreground border-border",
  "Review candidate": "bg-accent/15 text-accent border-accent/40",
  "Must-have candidate": "bg-success/15 text-success border-success/40",
  "Strong prospect": "bg-accent/15 text-accent border-accent/40",
  "Possible fit": "bg-warning/15 text-warning border-warning/40",
  "Low fit": "bg-destructive/15 text-destructive border-destructive/40",
};

export function verdictFor(score: number): Verdict {
  if (score >= 85) return "Must-have candidate";
  if (score >= 70) return "Strong prospect";
  if (score >= 55) return "Possible fit";
  return "Low fit";
}

export type ScoutProfile = {
  height: string;
  value: string;
  contract: string;
  apps: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  league: string;
  similar: string[];
  scout: string;
  form: number[];
  tags: string[];
  heat: [number, number][];
};
// Heat points are in a 105x68 frame, attacking left→right.
export const scoutProfiles: Record<string, ScoutProfile> = {
  p1: {
    height: "1.76 m",
    value: "€1.4M",
    contract: "Jun 2027",
    apps: 24,
    minutes: 1912,
    goals: 7,
    assists: 9,
    league: "Premijer Liga U21",
    similar: ["Bukayo Saka (U19)", "Jérémy Doku (U19)"],
    scout:
      "Elite counter-pressing intensity for a U21 wide player; reacts to loss triggers in < 1s. Ready for senior minutes as an impact sub.",
    form: [6.8, 7.2, 7.9, 6.5, 8.1, 7.4],
    tags: ["Inverted", "High work-rate", "Press trigger"],
    heat: [
      [78, 56],
      [84, 52],
      [70, 58],
      [88, 44],
      [62, 54],
      [74, 48],
    ],
  },
  p2: {
    height: "1.81 m",
    value: "€0.9M",
    contract: "Jun 2026",
    apps: 27,
    minutes: 2210,
    goals: 3,
    assists: 5,
    league: "Premijer Liga BiH",
    similar: ["Luka Sučić (U20)"],
    scout:
      "Covers 12.1 km/90. Strong in second-ball scenarios; needs work receiving on the half-turn under pressure.",
    form: [6.9, 7.0, 6.6, 7.3, 7.1, 6.8],
    tags: ["Box-to-box", "Second balls"],
    heat: [
      [50, 34],
      [60, 30],
      [44, 40],
      [66, 38],
      [54, 26],
      [40, 32],
    ],
  },
  p3: {
    height: "1.84 m",
    value: "€0.5M",
    contract: "Jun 2025",
    apps: 15,
    minutes: 820,
    goals: 5,
    assists: 1,
    league: "Premijer Liga U19",
    similar: ["Haris Begić (U19)"],
    scout:
      "Relentless first-line presser. Sample size is small — recommend live scouting in two more fixtures.",
    form: [6.2, 7.5, 5.9, 6.8, 6.4, 7.0],
    tags: ["Pressing 9", "Raw"],
    heat: [
      [88, 34],
      [92, 30],
      [84, 40],
      [80, 28],
      [94, 38],
      [86, 22],
    ],
  },
  p4: {
    height: "1.79 m",
    value: "€0.6M",
    contract: "Jun 2026",
    apps: 22,
    minutes: 1780,
    goals: 1,
    assists: 6,
    league: "Prva liga FBiH",
    similar: ["—"],
    scout:
      "Volume crosser but leaves the far-side channel exposed in transition. Better suited to a back-three wing-back role.",
    form: [6.4, 6.1, 6.7, 5.8, 6.3, 6.0],
    tags: ["Overlapping", "Crossing"],
    heat: [
      [60, 8],
      [74, 6],
      [50, 10],
      [82, 12],
      [40, 6],
      [66, 14],
    ],
  },
  p5: {
    height: "1.88 m",
    value: "€1.1M",
    contract: "Jun 2028",
    apps: 26,
    minutes: 2280,
    goals: 2,
    assists: 1,
    league: "Premijer Liga U21",
    similar: ["Josko Gvardiol (U19)"],
    scout:
      "Comfortable stepping into midfield with the ball. Recovery angles are a standout trait; aerial timing still developing.",
    form: [7.1, 7.0, 7.4, 6.9, 7.6, 7.2],
    tags: ["Ball-playing", "Step-up"],
    heat: [
      [22, 40],
      [28, 34],
      [34, 44],
      [18, 30],
      [40, 38],
      [26, 46],
    ],
  },
};

export const coachDetails: Record<string, { evidence: string; drill: string; clip: string }> = {
  Positioning: {
    evidence: "Avg. distance to touchline 7.1m → 18.9m in 6s before loss (tracking, 25 fps)",
    drill: "4v4+3 width-lock rondo, touchline channel zones",
    clip: "67:42 – 67:58",
  },
  Timing: {
    evidence: "Recovery sprint onset +1.9s after loss vs. squad median +0.6s",
    drill: "Loss-trigger reaction game: 5s counter-press rule",
    clip: "67:58 – 68:04",
  },
  Awareness: {
    evidence: "0 shoulder checks in 5s pre-reception (ghost: 2)",
    drill: "Scanning cue drill with colour call-outs",
    clip: "67:50 – 67:56",
  },
  "Passing option selection": {
    evidence: "Chose 3v1 inside lane (xPass 41%) over RB recycle (xPass 92%)",
    drill: "Decision-making SSG with weighted safe-pass zones",
    clip: "67:56",
  },
  "Movement into space": {
    evidence: "Half-space entry before CB was pinned — lane closed in 0.8s",
    drill: "Third-man run patterns, 9 pins → 7 attacks",
    clip: "67:44 – 67:50",
  },
  "Defensive recovery": {
    evidence: "Recovery angle 38° vs. optimal 62° to block lane to Mujkić",
    drill: "Recovery-run angle drill vs. diagonal switches",
    clip: "68:04 – 68:10",
  },
};
