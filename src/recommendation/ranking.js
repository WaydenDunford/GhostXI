import { requireValue } from "../domain/validation.js";
import { classifyPosition, footballRecommendation } from "./config.js";

const clamp = (n) => Math.max(0, Math.min(1, n));
export function eventTags(event) {
  const tags = [];
  if (event.type === "Shot") tags.push("shooting", "finishing", "shot_stopping", "defensive_positioning");
  if (event.type === "Pass") {
    tags.push("distribution", "space_creation", "marking");
    if (event.pass?.endLocation && event.location && event.pass.endLocation.x - event.location.x >= 10) tags.push("progressive_pass", "attacking_run");
    if (event.underPressure) tags.push("pressured_pass");
    if (event.pass?.shotAssist || event.pass?.goalAssist) tags.push("chance_creation");
    if (event.pass?.cross) tags.push("cross", "cross_collection");
  }
  if (event.type === "Carry") {
    tags.push("space_creation");
    if (event.carry?.endLocation && event.location && event.carry.endLocation.x - event.location.x >= 10) {
      tags.push("progressive_carry", "attacking_run");
    }
  }
  if (event.type === "Dribble") tags.push("one_on_one");
  if (event.type === "Ball Recovery") tags.push("possession_recovery", "defensive_transition");
  if (event.type === "Interception") tags.push("interception", "possession_recovery");
  if (event.type === "Pressure") tags.push("defensive_transition", "marking", "pressured_pass");
  if (event.type === "Clearance") tags.push("clearance", "defensive_positioning");
  return [...new Set(tags)];
}

/** All components are engineering scores. Momentum is descriptive, not causal. */
export function rankPlayerMoments({ matchId, playerId, position, windows, limit = 5, config = footballRecommendation, weights = config.weights }) {
  requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 5, "Moment limit must be an integer from 1 to 5.");
  const names = Object.keys(config.weights);
  requireValue(Object.keys(weights).length === names.length && names.every((key) => Number.isFinite(weights[key]) && weights[key] >= 0)
    && Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) < 1e-8, "Recommendation weights must be nonnegative and sum to one.");
  const role = classifyPosition(position, config);
  const roleTags = role ? config.roles[role].tags : {};
  const maxMomentum = Math.max(0.0001, ...windows.map(({ momentumDelta }) => Math.abs(momentumDelta)));
  const scored = windows.map((window) => {
    const relevance = Math.max(0, ...window.tags.map((tag) => roleTags[tag] ?? 0));
    const parts = { momentum: clamp(Math.abs(window.momentumDelta) / maxMomentum), position: clamp(relevance),
      involvement: clamp(window.involvement), opportunity: clamp(window.opportunity), coverage: clamp(window.dataCoverage) };
    requireValue(Object.values(parts).every(Number.isFinite) && Number.isFinite(window.timeSec), "Moment components and timestamps must be finite.");
    const score = names.reduce((sum, name) => sum + weights[name] * parts[name], 0);
    return { window, result: { id: window.id, matchId, timeSec: window.timeSec, title: window.title,
      description: window.description, momentumDelta: window.momentumDelta, relevanceScore: Number(score.toFixed(6)),
      relevanceReasons: [
        `Selected player ${playerId}; role ${role ?? "unknown"}. ${window.evidence}`,
        ...names.map((name) => `${name}: ${parts[name].toFixed(3)} × provisional weight ${weights[name].toFixed(2)}`),
        "Momentum change is descriptive and does not establish an error or causation.",
        window.dataStatus === "estimated" ? "Movement requires a labeled event/formation reconstruction; complete observed tracking is unavailable." : "Observed tracking exists for this window.",
      ], position: role ?? "unknown", dataStatus: window.dataStatus, dataCoverage: window.dataCoverage } };
  }).sort((a, b) => b.result.relevanceScore - a.result.relevanceScore || a.result.timeSec - b.result.timeSec || a.result.id.localeCompare(b.result.id));
  const chosen = [];
  for (const item of scored) {
    if (chosen.some(({ result }) => result.id === item.result.id)) continue;
    if (chosen.some(({ window }) => window.period === item.window.period && Math.max(0,
      Math.min(window.endSec, item.window.endSec) - Math.max(window.startSec, item.window.startSec))
      / Math.min(window.endSec - window.startSec, item.window.endSec - item.window.startSec) > config.maxWindowOverlap)) continue;
    chosen.push(item);
    if (chosen.length === limit) break;
  }
  return chosen.map(({ result }) => result);
}
