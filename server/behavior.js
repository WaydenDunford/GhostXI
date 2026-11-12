import { DomainError, requireValue } from "../src/domain/validation.js";
import { simulateBehavior } from "../src/ai/simulation.js";

export function createBehaviorService({ match, model = null }) {
  if (model) {
    requireValue(model.schemaVersion === "1.0" && Array.isArray(model.profiles) && model.profiles.length > 0
      && new Set(model.profiles.map(({ id }) => id)).size === model.profiles.length, "Invalid behavior model artifact.");
    for (const profile of model.profiles) {
      requireValue(profile.cutoffDate === model.cutoffDate && profile.sample.appearances.every(({ date }) => date < model.cutoffDate)
        && profile.physical?.provenance === "ASSUMED_SHARED_ROLE_PRIOR"
        && Number.isFinite(profile.physical.maxSpeed) && profile.physical.maxSpeed > 0 && profile.physical.maxSpeed <= 12
        && Number.isFinite(profile.physical.acceleration) && profile.physical.acceleration > 0 && profile.physical.acceleration <= 8,
      "The behavior artifact has invalid training chronology or physical limits.");
    }
  }
  function requireModel() {
    if (!model) throw new DomainError("Run npm run prepare:external and npm run prepare:ai to prepare the behavior demo.", "BEHAVIOR_NOT_READY", 503);
  }
  function profileById(id) {
    requireModel();
    const key = String(id).startsWith("statsbomb:") ? String(id) : `statsbomb:${id}`;
    const profile = model.profiles.find((profile) => profile.id === key);
    if (!profile) throw new DomainError("Behavior profile not found.", "PROFILE_NOT_FOUND", 404);
    return profile;
  }
  return {
    getBehaviorStatus: () => ({ ready: model !== null, modelType: "empirical event preferences + utility-based game agents",
      profileCount: model?.profiles.length ?? 0, historyMatchCount: model?.historyMatchCount ?? 0,
      fittingMilliseconds: model?.fittingMilliseconds ?? null, downloadAndPreparationSeconds: model?.downloadAndPreparationSeconds ?? null }),
    getBehaviorProfiles() { requireModel(); return structuredClone(model); },
    getBehaviorProfile(id) { return structuredClone(profileById(id)); },
    getBehaviorScenarios() {
      requireModel();
      return [{ id: "metrica-attacking-reception", matchId: match.id, momentId: "home-deep-pass-attack",
        title: "Receiving decision: Yamal vs Saka behavior experiment", durationSec: 8,
        candidateIds: model.profiles.map(({ id }) => id),
        description: "The named candidate takes the anonymous player's position at the recorded receiving opportunity. Its subsequent choices and all agent responses are modeled.",
        reference: "The original eight-second clip is returned as context; only 0.4 seconds remain after the experiment's starting frame. The modeled continuation must not be presented as an observed replay.",
        source: match.source }];
    },
    runBehaviorSimulation({ matchId, momentId, candidateId, seed = 42 }) {
      requireModel();
      if (matchId !== match.id) throw new DomainError("Behavior scenario match not found.", "MATCH_NOT_FOUND", 404);
      return simulateBehavior({ match, momentId, profile: profileById(candidateId), seed });
    },
  };
}
