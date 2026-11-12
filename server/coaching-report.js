// Coaching decisions are deliberately based on movement measurements, not the
// rounded role score. These are practical comparison tolerances, not calibrated
// probabilities or claims about a player's real physical abilities.
const MEASURES = [
  { id: "meanBallDistanceM", label: "Average distance to ball", unit: "m", direction: -1,
    tolerance: (base) => Math.max(0.25, Math.abs(base) * 0.03) },
  { id: "ballAccessFraction", label: "Time close to ball", unit: "%", direction: 1,
    tolerance: () => 0.03, scale: 100 },
  { id: "valueAccessProxy", label: "Access to valuable space (proxy)", unit: "proxy", direction: 1,
    tolerance: (base) => Math.max(0.0001, Math.abs(base) * 0.1) },
  { id: "minGhostSeparationM", label: "Closest spacing between replacements", unit: "m", direction: 1,
    tolerance: () => 0.25, spacing: true },
];

const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const replacementsOf = (scenario) => {
  const source = Array.isArray(scenario?.replacements) && scenario.replacements.length
    ? scenario.replacements : [scenario ?? {}];
  return source.filter((pair) => text(pair.originalPlayerId) && text(pair.candidatePlayerId))
    .map(({ originalPlayerId, candidatePlayerId }) => ({ originalPlayerId, candidatePlayerId }));
};
const outgoingKey = (pairs) => pairs.map((pair) => pair.originalPlayerId).sort();
const pairsKey = (pairs) => pairs.map((pair) => `${pair.originalPlayerId}:${pair.candidatePlayerId}`).sort();
const format = (value, digits = 1) => Number(value.toFixed(digits)).toString();
const joinNames = (names) => names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} other tested options`
  : names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

function namedPairs(pairs, people) {
  return pairs.map((pair) => ({ ...pair,
    originalPlayerName: text(people.get(pair.originalPlayerId)?.name) ?? "Current player",
    candidateName: text(people.get(pair.candidatePlayerId)?.name) ?? "Alternative player",
  }));
}

function metricRows(branch) {
  return MEASURES.flatMap((measure) => {
    const original = numeric(branch?.originalMetrics?.[measure.id]);
    const alternative = numeric(branch?.alternativeMetrics?.[measure.id]);
    if (original === null || alternative === null) return [];
    const scale = measure.scale ?? 1;
    return [{ id: measure.id, label: measure.label, original: original * scale,
      alternative: alternative * scale, delta: (alternative - original) * scale, unit: measure.unit }];
  });
}

function analyzeBranch(branch, pairs, people) {
  const replacements = namedPairs(pairs, people);
  const positives = [], negatives = [];
  let measured = 0;
  for (const measure of MEASURES) {
    const original = numeric(branch?.originalMetrics?.[measure.id]);
    const alternative = numeric(branch?.alternativeMetrics?.[measure.id]);
    if (original === null || alternative === null) continue;
    if (!measure.spacing) measured++;
    const gain = (alternative - original) * measure.direction;
    if (measure.spacing) {
      // Greater separation alone is not a benefit; avoid creating a new close
      // collision or preserve an improvement from already crowded movement.
      if (alternative < 2 && gain <= -0.25) negatives.push(`The replacements come within ${format(alternative)} m of each other, reducing their closest spacing by ${format(-gain)} m.`);
      else if (original < 2 && gain >= 0.5) positives.push(`Closest spacing improves from ${format(original)} m to ${format(alternative)} m.`);
      continue;
    }
    const tolerance = measure.tolerance(original);
    if (Math.abs(gain) + 1e-12 < tolerance) continue;
    const destination = gain > 0 ? positives : negatives;
    if (measure.id === "meanBallDistanceM") destination.push(`Average distance to the ball ${gain > 0 ? "falls" : "rises"} by ${format(Math.abs(gain))} m (${format(original)} to ${format(alternative)} m).`);
    if (measure.id === "ballAccessFraction") destination.push(`Time close to the ball ${gain > 0 ? "rises" : "falls"} from ${format(original * 100)}% to ${format(alternative * 100)}%.`);
    if (measure.id === "valueAccessProxy") destination.push(`Access to valuable space ${gain > 0 ? "improves" : "falls"} in the movement estimate (${format(original, 4)} to ${format(alternative, 4)}).`);
  }
  const verdict = measured === 0 || (positives.length && negatives.length) ? "inconclusive"
    : positives.length ? "replace" : "keep";
  const reason = measured === 0 ? "There are not enough movement measurements to judge this change."
    : positives.length && negatives.length ? `This change has a tradeoff: ${positives[0]} ${negatives[0]}`
      : positives.length ? positives.join(" ") : negatives.length ? negatives.join(" ")
        : "The movement differences are too small to support a substitution in this phase.";
  return {
    kind: pairs.length > 1 ? "combined" : "individual", replacements, verdict, reason,
    originalValue: numeric(branch?.metrics?.originalValue),
    alternativeValue: numeric(branch?.metrics?.alternativeValue),
    delta: numeric(branch?.metrics?.delta), metrics: metricRows(branch),
    reasons: [...positives, ...negatives], hasMeasurements: measured > 0,
  };
}

function contextMatches(evaluation, target, pairs, matchId, windowSeconds) {
  const other = evaluation?.scenario;
  if (!other || !evaluation.result || (evaluation.result.status && evaluation.result.status !== "completed")) return false;
  if (other.matchId !== matchId || other.momentId !== target?.momentId) return false;
  const otherPairs = replacementsOf(other);
  if (!same(outgoingKey(otherPairs), outgoingKey(pairs))) return false;
  if (pairs.length > 1 && !pairs.slice(1).every((pair) => otherPairs.some((otherPair) => same(pair, otherPair)))) return false;
  if (evaluation.result.scenarioId && other.id && evaluation.result.scenarioId !== other.id) return false;
  const evidence = evaluation.result.evidence?.recordedFacts;
  if (evidence?.matchId && evidence.matchId !== matchId) return false;
  // Some callers supply precise windows in addition to the moment identifier.
  // Never borrow evidence across those windows when both endpoints are known.
  for (const key of ["windowSeconds", "startTimeSec", "endTimeSec", "sourceFrameStart", "sourceFrameEnd", "seed"]) {
    if (target?.[key] !== undefined && other[key] !== undefined && target[key] !== other[key]) return false;
  }
  if (numeric(other.windowSeconds) !== null && numeric(windowSeconds) !== null && other.windowSeconds !== windowSeconds) return false;
  return true;
}

function branchPairs(branch, evaluationPairs) {
  const explicit = replacementsOf({ replacements: branch?.replacements });
  return explicit.length ? explicit : evaluationPairs.length === 1 ? evaluationPairs : [];
}

function baselineMatches(left, right) {
  return MEASURES.filter((measure) => !measure.spacing).every(({ id }) => {
    const a = left.metrics.find((metric) => metric.id === id)?.original ?? null;
    const b = right.metrics.find((metric) => metric.id === id)?.original ?? null;
    return a === null && b === null || a !== null && b !== null && Math.abs(a - b) <= 1e-6;
  });
}

function compareResponses(left, right) {
  let better = false, worse = false, comparable = 0;
  for (const measure of MEASURES) {
    const a = left.metrics.find((metric) => metric.id === measure.id);
    const b = right.metrics.find((metric) => metric.id === measure.id);
    if (!a || !b) {
      if (a || b) return "unknown";
      continue;
    }
    comparable++;
    const scale = measure.scale ?? 1;
    const gain = (a.alternative - b.alternative) / scale * measure.direction;
    const threshold = measure.tolerance(a.original / scale);
    // Different but comfortable spacing is not a reason to rank two lineups.
    // It still prevents a claim that their movement measurements are tied.
    if (measure.spacing && Math.min(a.alternative, b.alternative) >= 2 && Math.abs(gain) >= threshold) return "unknown";
    if (gain + 1e-12 >= threshold) better = true;
    if (gain - 1e-12 <= -threshold) worse = true;
  }
  if (!comparable || better && worse) return "unknown";
  return better ? "better" : worse ? "worse" : "equal";
}

function publicBranch(branch) {
  const { hasMeasurements, selected, target, evaluationIndex, ...out } = branch;
  return out;
}

/** Build a bounded coaching recommendation solely from comparable simulations. */
export function buildCoachingReport({ match, scenario, evaluations = [], candidates = [], players = [], windowSeconds, momentTitle } = {}) {
  const pairs = replacementsOf(scenario);
  const people = new Map([...candidates, ...players].filter(Boolean).map((person) => [person.id, person]));
  const replacements = namedPairs(pairs, people);
  const originalPlayerId = pairs[0]?.originalPlayerId ?? null;
  const originalPlayerName = replacements[0]?.originalPlayerName ?? "Current player";
  const matchId = match?.id ?? scenario?.matchId ?? null;
  const duration = numeric(windowSeconds) ?? numeric(scenario?.windowSeconds);
  const phase = duration !== null ? `this ${format(duration)}-second phase` : "this simulated phase";
  const moment = text(momentTitle);
  const scoped = (Array.isArray(evaluations) ? evaluations : []).filter((evaluation) => contextMatches(evaluation, scenario, pairs, matchId, duration));
  // The selected run is authoritative over older evaluations of the same pair.
  scoped.sort((a, b) => Number(a.scenario?.id === scenario?.id) - Number(b.scenario?.id === scenario?.id));
  const collected = [];
  for (const [evaluationIndex, evaluation] of scoped.entries()) {
    const evaluationPairs = replacementsOf(evaluation.scenario);
    const sourceBranches = Array.isArray(evaluation.result.branches) && evaluation.result.branches.length
      ? evaluation.result.branches : [evaluation.result];
    for (const branch of sourceBranches) {
      const currentPairs = branchPairs(branch, evaluationPairs);
      if (!currentPairs.length || !currentPairs.every((pair) => evaluationPairs.some((expected) => same(expected, pair)))) continue;
      collected.push({ ...analyzeBranch(branch, currentPairs, people),
        evaluationIndex,
        selected: evaluation.scenario?.id === scenario?.id,
        target: same(pairsKey(currentPairs), pairsKey(pairs)),
      });
    }
  }
  const selectedBranches = collected.filter((branch) => branch.selected);
  const targetBranch = collected.filter((branch) => branch.target).at(-1);
  const baseline = targetBranch
    ?? collected.find((branch) => branch.kind === "individual" && branch.replacements[0].originalPlayerId === originalPlayerId && branch.selected)
      ?? collected.find((branch) => branch.kind === "individual" && branch.replacements[0].originalPlayerId === originalPlayerId);
  const byCandidate = new Map();
  for (const branch of collected) {
    if (branch.kind !== (pairs.length > 1 ? "combined" : "individual") || !branch.replacements.some((pair) => pair.originalPlayerId === originalPlayerId)) continue;
    if (baseline && !baselineMatches(baseline, branch)) continue;
    byCandidate.set(branch.replacements.find((pair) => pair.originalPlayerId === originalPlayerId).candidatePlayerId, branch);
  }
  const alternatives = [...byCandidate.values()].map((branch) => {
    const pair = branch.replacements.find((entry) => entry.originalPlayerId === originalPlayerId);
    return {
    candidateId: pair.candidatePlayerId, candidateName: pair.candidateName,
    verdict: branch.verdict, originalValue: branch.originalValue, alternativeValue: branch.alternativeValue,
    delta: branch.delta, metrics: branch.metrics, reason: branch.reason,
    branches: collected.filter((entry) => entry.evaluationIndex === branch.evaluationIndex && entry.replacements.some((entryPair) => entryPair.originalPlayerId === originalPlayerId)).map(publicBranch),
  }; });
  const beneficial = alternatives.filter((alternative) => alternative.verdict === "replace");
  const comparisonsTied = alternatives.length > 1 && alternatives.every((alternative) =>
    alternative.verdict === alternatives[0].verdict && compareResponses(alternative, alternatives[0]) === "equal");
  const dominant = beneficial.filter((alternative) => beneficial.every((other) => other === alternative || compareResponses(alternative, other) === "better"));
  let preferredCandidateId = !comparisonsTied && dominant.length === 1 ? dominant[0].candidateId : null;
  let verdict, headline, summary, reasons = [], actions = [];
  if (pairs.length > 1) {
    const combined = targetBranch?.kind === "combined" ? targetBranch : null;
    verdict = combined?.verdict ?? "inconclusive";
    preferredCandidateId = null;
    const namedChanges = replacements.map((pair) => `${pair.candidateName} for ${pair.originalPlayerName}`);
    headline = verdict === "replace" ? "Test the combined change in this phase"
      : verdict === "keep" ? "Keep the current combination for this phase" : "Test one change at a time";
    summary = combined ? `${joinNames(namedChanges)} ${verdict === "replace" ? "improves the measured movement" : verdict === "keep" ? "does not improve the measured movement" : "has an unresolved movement tradeoff"} in ${phase}.`
      : `Compare ${joinNames(namedChanges)} together before recommending the combined change in ${phase}.`;
    reasons = combined?.reasons?.length ? [...combined.reasons] : [combined?.reason ?? "The combined change has not been measured in this phase."];
    const individuals = selectedBranches.filter((branch) => branch.kind === "individual");
    for (const branch of individuals) {
      const pair = branch.replacements[0];
      actions.push(branch.verdict === "replace" ? `Test ${pair.candidateName} for ${pair.originalPlayerName} on its own in ${phase}.`
        : branch.verdict === "keep" ? `Keep ${pair.originalPlayerName} in this role; ${pair.candidateName} shows no clear movement benefit in ${phase}.`
          : `Compare ${pair.candidateName} for ${pair.originalPlayerName} in another phase before making that change.`);
    }
    if (verdict === "replace") actions.unshift(`Try ${joinNames(namedChanges)} together in this phase and check their spacing.`);
    if (!actions.length) actions.push(`Compare each of these changes separately in ${phase}.`);
  } else {
    verdict = beneficial.length ? "replace" : alternatives.length && alternatives.every((alternative) => alternative.verdict === "keep") ? "keep" : "inconclusive";
    const preferred = alternatives.find((alternative) => alternative.candidateId === preferredCandidateId);
    if (verdict === "replace") {
      headline = preferred ? `Test ${preferred.candidateName} for ${originalPlayerName}`
        : comparisonsTied ? `Test a substitution for ${originalPlayerName}; the options are level` : `Compare the tradeoffs before replacing ${originalPlayerName}`;
      summary = preferred ? `${preferred.candidateName} improves the measured movement for ${originalPlayerName}'s role in ${phase}. This supports a trial in this phase.`
        : comparisonsTied ? `${joinNames(beneficial.map((alternative) => alternative.candidateName))} improve the measured movement equally in ${phase}. There is no measured basis to choose one of them.`
          : `A substitution can improve the measured movement in ${phase}, but the tested options do not establish one clear best choice.`;
      reasons = preferred ? byCandidate.get(preferred.candidateId).reasons : [beneficial[0].reason];
      actions.push(preferred ? `Test ${preferred.candidateName} for ${originalPlayerName} in this phase.`
        : `Compare ${joinNames(beneficial.map((alternative) => alternative.candidateName))} in another phase before choosing a player.`);
    } else if (verdict === "keep") {
      headline = `Keep ${originalPlayerName} for this phase`;
      summary = `The tested substitutions do not show a clear movement improvement over ${originalPlayerName} in ${phase}.`;
      reasons = comparisonsTied ? [alternatives[0].reason] : [...new Set(alternatives.map((alternative) => alternative.reason))];
      actions.push(`Keep ${originalPlayerName} in this role for this phase.`, "Compare another match phase before making a substitution.");
    } else {
      headline = `Keep ${originalPlayerName} for now; compare the options`;
      summary = alternatives.length ? `The measured gains and losses do not support a clear substitution in ${phase}.`
        : `There is not enough comparable movement evidence to recommend a substitution for ${originalPlayerName}${moment ? ` in ${moment}` : ""}.`;
      reasons = alternatives.length ? [...new Set(alternatives.map((alternative) => alternative.reason))]
        : ["A recommendation needs the current player and an alternative measured in the same match phase."];
      actions.push(alternatives.length ? `Compare the same options in another phase before replacing ${originalPlayerName}.`
        : `Compare an alternative for ${originalPlayerName} in this phase. Keep the current player until that comparison is available.`);
    }
  }
  let evidenceNote = `This recommendation applies only to ${phase}. The other players and the ball follow the recorded paths. Time close to the ball and space access describe movement; they do not predict possession, goals or full-match suitability.`;
  if (comparisonsTied) {
    reasons.push("The compared players produce the same measured movement response under shared movement assumptions. This comparison cannot establish a difference in their individual abilities.");
    evidenceNote += " The tied options need a further comparison before choosing a player.";
  }
  return {
    matchId, scenarioId: scenario?.id ?? null, momentId: scenario?.momentId ?? null,
    originalPlayerId, originalPlayerName, windowSeconds: duration,
    verdict, headline, summary, reasons, actions, alternatives, preferredCandidateId,
    evidenceNote, comparisonsTied,
    branches: selectedBranches.length ? selectedBranches.map(publicBranch) : targetBranch ? [publicBranch(targetBranch)] : [],
  };
}
