// Per-sport squads: starting lineup + bench for the interactive substitution
// workflow. Scouting-pool replacements come from each sport's dataset candidates.
import type { SportId } from "./sports";

export type SquadPlayer = {
  id: string;
  num: number;
  name: string;
  position: string;
  secondaryPositions: string[];
  age: number;
  rating: number;
  coverage: number;
  attributes: Record<string, number | null>;
};

// Deterministic pseudo-random from a string seed (stable across reloads).
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const attr = (id: string, metrics: string[], base: number): Record<string, number | null> =>
  Object.fromEntries(
    metrics.map((m, i) => [m, Math.round(base + hashSeed(`${id}:${m}`) * 45 + i * 3)]),
  );

function p(
  id: string,
  num: number,
  name: string,
  position: string,
  secondary: string[],
  age: number,
  rating: number,
  coverage: number,
  metrics: string[],
  base = 45,
): SquadPlayer {
  return {
    id,
    num,
    name,
    position,
    secondaryPositions: secondary,
    age,
    rating,
    coverage,
    attributes: attr(id, metrics, base),
  };
}

export type Squad = { starting: SquadPlayer[]; bench: SquadPlayer[] };

const FB = ["Passing", "Positioning", "Interceptions", "Shooting", "Tactical awareness"];
const BB = ["Shooting efficiency", "Assists", "Rebounds", "Steals", "Spacing"];
const HK = ["Skating", "Passing", "Shooting", "Puck control", "Faceoffs"];
const HB = ["Shooting accuracy", "Passing", "Defensive coverage", "Positioning", "Speed"];
const VB = ["Serving", "Receiving", "Setting", "Attacking", "Blocking"];

export const squads: Record<SportId, Squad> = {
  football: {
    starting: [
      p("h1", 1, "Kurtović", "GK", [], 29, 6.8, 0.95, FB),
      p("h2", 2, "Vujić", "RB", ["CB"], 26, 6.6, 0.9, FB),
      p("h4", 4, "Ahmetović", "CB", ["DM"], 28, 6.7, 0.92, FB),
      p("h5", 5, "Lakić", "CB", [], 24, 6.5, 0.88, FB),
      p("h3", 3, "Ćosić", "LB", ["LWB"], 25, 6.9, 0.9, FB),
      p("h6", 6, "Džafić", "DM", ["CM"], 27, 7.0, 0.93, FB),
      p("h8", 8, "Rahmanović", "CM", ["AM", "DM"], 23, 6.4, 0.87, FB),
      p("h10", 10, "Tatar", "AM", ["CM", "RW"], 22, 7.1, 0.91, FB),
      p("h11", 11, "Beganović", "LW", ["RW"], 21, 6.8, 0.86, FB),
      p("h9", 9, "Hodžić", "ST", [], 30, 7.2, 0.94, FB),
      p("h7", 7, "Mešić", "RW", ["LW"], 26, 5.9, 0.89, FB),
    ],
    bench: [
      p("b12", 13, "Subotić", "GK", [], 27, 6.4, 0.9, FB),
      p("b15", 15, "Marjanović", "CB", ["DM"], 24, 6.3, 0.82, FB),
      p("b16", 16, "Softić", "CM", ["DM"], 22, 6.6, 0.8, FB),
      p("b17", 17, "Duranović", "RW", ["LW", "ST"], 21, 6.5, 0.78, FB),
      p("b19", 19, "Baljić", "ST", [], 23, 6.7, 0.84, FB),
      p("b20", 20, "Hasanović", "LB", ["LWB"], 25, 6.2, 0.79, FB),
    ],
  },
  basketball: {
    starting: [
      p("h1", 4, "Softić", "PG", ["SG"], 27, 7.0, 0.9, BB),
      p("h2", 7, "Delić", "SG", ["SF"], 25, 6.9, 0.88, BB),
      p("h8", 8, "Karić", "SF", ["SG"], 26, 5.9, 0.85, BB),
      p("h9", 9, "Hadžić", "PF", ["C"], 28, 7.1, 0.9, BB),
      p("h11", 12, "Tihić", "C", ["PF"], 30, 6.7, 0.87, BB),
    ],
    bench: [
      p("b5", 5, "Nalić", "PG", ["SG"], 22, 6.3, 0.76, BB),
      p("b10", 10, "Begić", "SG", ["SF"], 23, 6.4, 0.78, BB),
      p("b13", 13, "Kapo", "PF", ["C"], 24, 6.2, 0.74, BB),
      p("b15", 15, "Smajlović", "C", ["PF"], 21, 6.1, 0.7, BB),
    ],
  },
  hockey: {
    starting: [
      p("h1", 1, "Subašić", "G", [], 29, 7.3, 0.92, HK),
      p("h2", 4, "Begić", "D", [], 26, 6.6, 0.86, HK),
      p("h5", 5, "Kršo", "D", [], 24, 6.5, 0.84, HK),
      p("h9", 9, "Haračić", "C", ["LW"], 27, 7.0, 0.88, HK),
      p("h11", 11, "Smajić", "LW", ["RW"], 23, 6.8, 0.85, HK),
      p("h7", 77, "Durak", "RW", ["LW"], 26, 5.9, 0.83, HK),
    ],
    bench: [
      p("b30", 30, "Imamović", "G", [], 24, 6.2, 0.8, HK),
      p("b6", 6, "Tihić", "D", [], 22, 6.3, 0.75, HK),
      p("b14", 14, "Palić", "C", ["LW"], 21, 6.4, 0.77, HK),
      p("b17", 17, "Zukić", "RW", ["LW"], 25, 6.1, 0.73, HK),
    ],
  },
  handball: {
    starting: [
      p("h1", 1, "Ćorić", "GK", [], 30, 7.1, 0.9, HB),
      p("h2", 3, "Topić", "LW", ["RW"], 24, 6.8, 0.86, HB),
      p("h4", 4, "Mujić", "LB", ["CB"], 26, 6.7, 0.85, HB),
      p("h8", 8, "Salkić", "CB", ["LB"], 27, 7.0, 0.88, HB),
      p("h6", 6, "Bećiri", "RB", ["CB"], 25, 6.6, 0.84, HB),
      p("h9", 9, "Dizdarević", "RW", ["LW"], 23, 6.9, 0.85, HB),
      p("h5", 5, "Karić", "P", [], 28, 5.9, 0.82, HB),
    ],
    bench: [
      p("b12", 12, "Softić", "GK", [], 22, 6.3, 0.78, HB),
      p("b11", 11, "Kapić", "LB", ["CB"], 21, 6.4, 0.76, HB),
      p("b14", 14, "Nuhić", "CB", ["RB"], 23, 6.5, 0.79, HB),
      p("b17", 17, "Alagić", "P", [], 24, 6.2, 0.74, HB),
    ],
  },
  volleyball: {
    starting: [
      p("h1", 1, "Hadžić", "S", [], 27, 7.0, 0.88, VB),
      p("h2", 4, "Sarić", "OH", ["OP"], 25, 6.9, 0.86, VB),
      p("h3", 7, "Mehić", "MB", [], 26, 6.7, 0.84, VB),
      p("h4", 9, "Turić", "OP", ["OH"], 28, 7.1, 0.87, VB),
      p("h5", 11, "Osmić", "MB", [], 24, 6.5, 0.82, VB),
      p("h6", 6, "Jašić", "L", [], 26, 5.9, 0.85, VB),
    ],
    bench: [
      p("b3", 3, "Karić", "OH", ["OP"], 21, 6.3, 0.74, VB),
      p("b8", 8, "Begić", "S", [], 22, 6.4, 0.76, VB),
      p("b12", 12, "Nurić", "L", [], 20, 6.2, 0.72, VB),
    ],
  },
};
