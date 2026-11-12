// Four role-matched candidates per scenario: the fastest, the hardest worker without the ball,
// the quickest to sprint speed and a "hidden talent" (strong numbers, below-median 2024/25 value).
import { minutesInPosition } from "./profile.js";

const MIN_MINUTES = 900;

function median(values) {
  if (!values.length) return -Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function pickShortlists(scenarios, measures, valuations) {
  const used = new Set();
  const result = {};
  for (const { scenarioId, rows } of scenarios) {
    const groupMeasures = measures.get(scenarioId);
    const eligible = rows
      .filter((row) => minutesInPosition(row) >= MIN_MINUTES && groupMeasures.get(row.player_id)?.psv99Kmh != null)
      .map((row) => ({ id: row.player_id, m: groupMeasures.get(row.player_id) }));
    const valued = eligible.filter(({ id }) => valuations.get(id) && !valuations.get(id).older);
    const cutoff = median(valued.map(({ id }) => valuations.get(id).eur));
    const picks = [
      ["fastest", eligible, ({ m }) => m.psv99Kmh],
      ["outOfPossession", eligible.filter(({ m }) => m.oopHiPerMin !== null), ({ m }) => m.oopHiPerMin],
      ["acceleration", eligible.filter(({ m }) => m.timeToSprintS !== null), ({ m }) => -m.timeToSprintS],
      ["hiddenTalent", valued.filter(({ id }) => valuations.get(id).eur < cutoff),
        ({ m }) => (m.psv99Percentile + m.oopPercentile + m.sprintPercentile) / 3],
    ];
    result[scenarioId] = [];
    for (const [pick, pool, score] of picks) {
      const [chosen] = pool.filter(({ id }) => !used.has(id))
        .sort((a, b) => score(b) - score(a) || Number(a.id) - Number(b.id));
      if (!chosen) continue;
      used.add(chosen.id);
      result[scenarioId].push({ playerId: chosen.id, pick });
    }
  }
  return result;
}
