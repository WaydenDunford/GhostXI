// SkillCorner season numbers → percentiles within a position group → simulation settings.
// Columns as named in SkillCorner's A-League Men 2024/25 physical aggregates (60+ minute
// performances only): psv99 (peak sprint velocity, km/h), timetosprint_top3 (seconds), and the
// _tip / _otip splits (team in / out of possession). Exact definitions: SkillCorner's
// physical-data glossary.
const number = (value) => (value === undefined || value === null || String(value).trim() === "" ? null : Number(value));
const round3 = (value) => Math.round(value * 1000) / 1000;

export function minutesInPosition(row) {
  return (number(row.minutes_full_all) ?? 0) * (number(row.count_match) ?? 0);
}

export function dedupeGroup(rows, group) {
  const best = new Map();
  for (const row of rows) {
    if (row.position_group !== group) continue;
    const current = best.get(row.player_id);
    const order = current && (number(row.count_match) - number(current.count_match)
      || number(row.minutes_full_all) - number(current.minutes_full_all)
      || number(current.team_id) - number(row.team_id));
    if (!current || order > 0) best.set(row.player_id, row);
  }
  return [...best.values()];
}

export function percentile(value, population, higherIsBetter) {
  if (population.length <= 1) return 0.5;
  const worse = population.filter((other) => (higherIsBetter ? other < value : other > value)).length;
  return worse / (population.length - 1);
}

export function measureGroup(rows) {
  const values = rows.map((row) => {
    const minutesOut = number(row.minutes_full_otip);
    const distanceOut = number(row.hi_distance_full_otip);
    return {
      row,
      psv99Kmh: number(row.psv99),
      timeToSprintS: number(row.timetosprint_top3),
      oopHiPerMin: minutesOut > 0 && distanceOut !== null ? distanceOut / minutesOut : null,
    };
  });
  const population = (key) => values.map((entry) => entry[key]).filter((value) => value !== null && Number.isFinite(value));
  const [speeds, sprints, intensities] = [population("psv99Kmh"), population("timeToSprintS"), population("oopHiPerMin")];
  return new Map(values.map(({ row, psv99Kmh, timeToSprintS, oopHiPerMin }) => {
    const filled = [];
    if (timeToSprintS === null) filled.push("timeToSprint");
    if (oopHiPerMin === null) filled.push("outOfPossession");
    return [row.player_id, {
      psv99Kmh,
      psv99Percentile: psv99Kmh === null ? 0.5 : percentile(psv99Kmh, speeds, true),
      timeToSprintS,
      sprintPercentile: timeToSprintS === null ? 0.5 : percentile(timeToSprintS, sprints, false),
      oopHiPerMin,
      oopPercentile: oopHiPerMin === null ? 0.5 : percentile(oopHiPerMin, intensities, true),
      minutes: minutesInPosition(row),
      matches: number(row.count_match),
      filled,
    }];
  }));
}

export function settingsFromMeasures({ psv99Kmh, sprintPercentile, oopPercentile }) {
  return {
    topSpeed: round3(psv99Kmh / 3.6),
    acceleration: round3(4 + 2 * sprintPercentile),
    reaction: round3(0.48 - 0.32 * sprintPercentile),
    engageRange: round3(3 + 6 * oopPercentile),
  };
}
