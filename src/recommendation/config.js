export const footballRecommendation = {
  sportId: "football",
  weights: { momentum: 0.30, position: 0.25, involvement: 0.20, opportunity: 0.15, coverage: 0.10 },
  windowSeconds: 8,
  maxWindowOverlap: 0.25,
  roles: {
    goalkeeper: { aliases: ["goalkeeper", "keeper", "gk"], tags: { shot_stopping: 1, defensive_positioning: 0.9, distribution: 0.85, cross_collection: 1 }, adjacent: {} },
    defender: { aliases: ["back", "defender", "def", "cb", "lcb", "rcb", "lb", "rb"], tags: { interception: 1, defensive_transition: 1, marking: 0.85, clearance: 1 }, adjacent: { midfielder: 0.60 } },
    winger: { aliases: ["wing", "wide midfielder", "lw", "rw", "lm", "rm"], tags: { attacking_run: 0.85, progressive_carry: 1, cross: 1, one_on_one: 0.9, chance_creation: 0.8 }, adjacent: { striker: 0.75, midfielder: 0.65 } },
    midfielder: { aliases: ["midfield", "mid", "central midfielder", "cm", "dm", "am"], tags: { progressive_pass: 1, possession_recovery: 0.95, pressured_pass: 1, space_creation: 0.8, chance_creation: 0.8 }, adjacent: { winger: 0.65, defender: 0.60 } },
    striker: { aliases: ["forward", "striker", "attack", "fwd", "cf", "st"], tags: { shooting: 1, attacking_run: 0.9, chance_creation: 0.8, finishing: 1 }, adjacent: { winger: 0.75 } },
  },
  modeledPhysical: { pace: 60, positioning: 60, defending: 60, passing: 60, stamina: 60,
    acceleration: 4, reaction: 0.25, stepOut: 4 },
  // Engineering usability score, not the fraction of all coordinates measured.
  coverage: { tracking: 1, eventTimeline: 0.15, knownLineup: 0.10, actorLocation: 0.10 },
};

export function classifyPosition(position, config = footballRecommendation) {
  if (!position || position === "unknown") return null;
  const text = position.toLowerCase();
  return Object.entries(config.roles).find(([key, profile]) => key === text
    || profile.aliases.some((alias) => text === alias || (alias.length > 3 && text.includes(alias))))?.[0] ?? null;
}

export function positionFit(original, natural, secondary = [], config = footballRecommendation) {
  const role = classifyPosition(original, config);
  const candidateRole = classifyPosition(natural, config);
  if (!role || !candidateRole) return null;
  if (role === candidateRole) return 1;
  if (secondary.some((position) => classifyPosition(position, config) === role)) return 0.8;
  return config.roles[role].adjacent[candidateRole] ?? 0;
}
