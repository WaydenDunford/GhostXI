import { normalizeStatsBombMatch } from "../data/statsbomb.js";
import { requireValue } from "../domain/validation.js";

const ACTIONS = ["pass", "carry", "shoot"];
const actionOf = ({ type }) => ({ Pass: "pass", Carry: "carry", Shot: "shoot" })[type];
export const behaviorContext = (x, underPressure) => `${x < 35 ? "defensive" : x < 70 ? "middle" : "attacking"}:${underPressure ? "pressure" : "free"}`;
const counts = (events) => Object.fromEntries(ACTIONS.map((action) => [action, events.filter((event) => actionOf(event) === action).length]));
const mix = (events, prior = { pass: 1 / 3, carry: 1 / 3, shoot: 1 / 3 }, strength = 20) => {
  const found = counts(events);
  return Object.fromEntries(ACTIONS.map((action) => [action, (found[action] + strength * prior[action]) / (events.length + strength)]));
};
const mean = (values) => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const usable = (event) => event.period <= 4 && actionOf(event) && event.location;
const logLoss = (events, choose) => mean(events.map((event) => -Math.log(Math.max(1e-9, choose(event)[actionOf(event)]))));

function binaryRate(own, cohort, eligible, success) {
  const pool = cohort.filter(eligible);
  const samples = own.filter(eligible);
  const prior = (pool.filter(success).length + 1) / (pool.length + 2);
  return { value: (samples.filter(success).length + 8 * prior) / (samples.length + 8),
    observed: samples.length ? samples.filter(success).length / samples.length : null,
    samples: samples.length, smoothingStrength: 8 };
}

/** Empirical event-frequency profiles, not a trained neural network or a calibrated action predictor. */
export function buildBehaviorProfiles({ history, external }) {
  requireValue(history?.schemaVersion === "1.0" && Array.isArray(history.matches) && history.matches.length > 0
    && typeof history.cutoffDate === "string", "Prepared behavior history is required.");
  requireValue(history.matches.every(({ metadata }) => metadata.match_date < history.cutoffDate
    && metadata.match_id !== history.holdoutMatchId), "Behavior fitting cannot include the holdout match or future matches.");
  const matches = history.matches.map(normalizeStatsBombMatch);
  requireValue(new Set(matches.map(({ id }) => id)).size === matches.length, "Behavior history contains duplicate matches.");
  const holdoutRaw = external?.statsbomb?.matches.find(({ metadata }) => metadata.match_id === history.holdoutMatchId);
  requireValue(holdoutRaw && holdoutRaw.metadata.match_date === history.cutoffDate, "The separate final is required for held-out validation.");
  const holdout = normalizeStatsBombMatch(holdoutRaw);
  const candidates = [316046, 22084];
  const allEvents = matches.flatMap(({ events }) => events).filter(usable);
  const cohort = allEvents.filter((event) => !candidates.includes(event.playerId)
    && ["Right Wing", "Left Wing", "Right Midfield", "Left Midfield"].includes(event.positionName));
  requireValue(cohort.length > 0, "No winger event cohort is available for smoothing.");
  const cohortMix = mix(cohort, undefined, 3);
  const cells = Object.fromEntries(["defensive", "middle", "attacking"].flatMap((zone) => [false, true].map((pressure) => {
    const key = `${zone}:${pressure ? "pressure" : "free"}`;
    const events = cohort.filter(({ location, underPressure }) => behaviorContext(location.x, underPressure) === key);
    return [key, { events, prior: mix(events, cohortMix, 20) }];
  })));
  return {
    schemaVersion: "1.0", cutoffDate: history.cutoffDate, holdoutMatchId: history.holdoutMatchId,
    revision: history.revision, historyMatchCount: matches.length,
    cohort: { role: "wingers", actionEvents: cohort.length, excludedPlayerIds: candidates },
    historicalPlayerStats: matches.flatMap((match) => match.players.map((player) => ({
      matchId: match.providerId, date: match.date, teamId: player.teamId, playerId: player.id,
      positions: player.positions, minutes: player.minutesPlayed, stats: player.stats,
    }))),
    profiles: candidates.map((id) => {
      const link = external.playerLinks.find(({ statsbombId }) => statsbombId === id);
      requireValue(link, "The candidate needs an explicit provider-ID crosswalk.");
      const own = allEvents.filter(({ playerId }) => playerId === id);
      const appearances = matches.flatMap((match) => match.players.filter((player) => player.providerId === id
        && (player.minutesPlayed > 0 || match.events.some((event) => event.playerId === id)))
        .map((player) => ({ matchId: match.providerId, date: match.date, minutes: player.minutesPlayed })));
      requireValue(own.length > 0 && appearances.length > 0, "The candidate has no pre-cutoff history.");
      const contexts = Object.fromEntries(Object.entries(cells).map(([key, { prior }]) => {
        const events = own.filter(({ location, underPressure }) => behaviorContext(location.x, underPressure) === key);
        return [key, { probabilities: mix(events, prior, 20), counts: counts(events), sampleSize: events.length,
          personalizationStrength: events.length / (events.length + 20), cohortPrior: prior }];
      }));
      const eligibleCarry = (event) => event.type === "Carry" && event.carry?.endLocation && event.location;
      const eligiblePass = (event) => event.type === "Pass" && event.pass?.endLocation && event.location;
      const carryInward = binaryRate(own, cohort, eligibleCarry, (event) =>
        Math.abs(event.carry.endLocation.y - 34) < Math.abs(event.location.y - 34) - 1.5);
      const carryForward = binaryRate(own, cohort, eligibleCarry, (event) => event.carry.endLocation.x - event.location.x >= 3);
      const forwardPassing = binaryRate(own, cohort, eligiblePass, (event) => event.pass.endLocation.x - event.location.x >= 10);
      const passCompletion = binaryRate(own, cohort, (event) => event.type === "Pass", (event) => event.pass.completed);
      const wideActivity = binaryRate(own, cohort, (event) => Boolean(event.location),
        (event) => event.location.y < 17 || event.location.y > 51);
      const finalEvents = holdout.events.filter((event) => usable(event) && event.playerId === id);
      const choose = (event) => contexts[behaviorContext(event.location.x, event.underPressure)].probabilities;
      return {
        id: `statsbomb:${id}`, statsbombId: id, transfermarktId: link.transfermarktId,
        name: link.transfermarktName, role: "winger", cutoffDate: history.cutoffDate,
        sample: { matchCount: appearances.length,
          minutes: appearances.every(({ minutes }) => minutes !== null) ? appearances.reduce((sum, item) => sum + item.minutes, 0) : null,
          knownMinutes: appearances.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
          unknownMinutesMatchCount: appearances.filter(({ minutes }) => minutes === null).length,
          actionEvents: own.length, counts: counts(own), appearances },
        habits: { actionMix: mix(own, cohortMix, 20), contexts, carryInward, carryForward,
          forwardPassing, passCompletion, wideActivity,
          observedFootCounts: { left: own.filter(({ bodyPart }) => bodyPart === "Left Foot").length,
            right: own.filter(({ bodyPart }) => bodyPart === "Right Foot").length } },
        physical: { provenance: "ASSUMED_SHARED_ROLE_PRIOR", maxSpeed: 7, acceleration: 4,
          reactionSeconds: 0.25, ballSpeed: 15, description: "Identical kinematic limits for both candidates; no measured pace/reaction data is available." },
        confidence: { level: "limited", description: "One tournament and a small player sample. Context frequencies are smoothed toward other wingers; they are not calibrated real-world decision probabilities." },
        validation: { matchId: holdout.providerId, date: holdout.date, events: finalEvents.length,
          eventTypeLogLoss: logLoss(finalEvents, choose),
          cohortEventTypeLogLoss: logLoss(finalEvents, (event) => cells[behaviorContext(event.location.x, event.underPressure)].prior),
          interpretation: "Held-out event-type frequency loss, lower is better. This does not validate movement or counterfactual outcomes." },
        assumptions: ["Pass/carry/shot event mix is used as a policy preference; event logging is not a sequence of all available decisions.",
          "On-ball locations and carry direction preferences are transferred to off-ball positioning as a modeling assumption.",
          "The anonymous Metrica scene is a separate tactical experiment, not an observed match by this named player.",
          "Market value, age and future matches do not influence action selection."],
      };
    }),
    methodology: { smoothingStrength: 20, scalarSmoothingStrength: 8,
      contexts: "Three longitudinal pitch zones × pressure/free, conditioned on recorded under_pressure flags.",
      probabilities: "(player action count + 20 × winger-cohort action share) / (player context events + 20)",
      direction: "StatsBomb actor-relative locations, scaled to 105×68 metres. No global tracking reconstruction.",
      model: "Empirical behavior profile plus heuristic utility-based game agents; no neural-network training." },
  };
}
