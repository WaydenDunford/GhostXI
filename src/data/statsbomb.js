import { requireValue } from "../domain/validation.js";

const PERIOD_BASE = { 1: 0, 2: 2700, 3: 5400, 4: 6300, 5: 7200 };
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const seconds = (clock) => {
  const parts = clock?.split(":").map(Number);
  if (!parts || ![2, 3].includes(parts.length) || !parts.every(Number.isFinite)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};
const location = (value) => Array.isArray(value) && finite(value[0]) && finite(value[1])
  ? { x: value[0] * 105 / 120, y: value[1] * 68 / 80 } : null;
const round = (value) => Math.round(value * 10000) / 10000;

function minutesPlayed(positions, durations, offsets) {
  const periods = Object.keys(durations).map(Number).filter((period) => period <= 4);
  const lastPeriod = Math.max(...periods);
  const intervals = [];
  for (const position of positions ?? []) {
    const fromPeriod = position.from_period;
    const toPeriod = position.to_period ?? lastPeriod;
    const from = seconds(position.from);
    const to = position.to === null || position.to === undefined ? null : seconds(position.to);
    if (!periods.includes(fromPeriod) || !periods.includes(toPeriod) || from === null
      || (position.to != null && to === null)) return null;
    const start = offsets[fromPeriod] + Math.max(0, Math.min(durations[fromPeriod], from - PERIOD_BASE[fromPeriod]));
    const end = to === null ? offsets[toPeriod] + durations[toPeriod]
      : offsets[toPeriod] + Math.max(0, Math.min(durations[toPeriod], to - PERIOD_BASE[toPeriod]));
    if (end < start) return null;
    intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [start, nextEnd] of intervals) {
    total += Math.max(0, nextEnd - Math.max(start, end));
    end = Math.max(end, nextEnd);
  }
  return round(total / 60);
}

export function normalizeStatsBombMatch({ metadata, lineups, events }) {
  requireValue(metadata && Number.isInteger(metadata.match_id) && Array.isArray(lineups) && lineups.length === 2
    && Array.isArray(events) && events.length > 0, "StatsBomb requires match metadata, two lineups and events.");
  const durations = {};
  const ids = new Set();
  for (const event of events) {
    const time = seconds(event.timestamp);
    requireValue(typeof event.id === "string" && !ids.has(event.id) && Number.isInteger(event.index)
      && [1, 2, 3, 4, 5].includes(event.period) && time !== null && time >= 0, "Invalid/duplicate StatsBomb event identity or time.");
    requireValue(event.team && [metadata.home_team.home_team_id, metadata.away_team.away_team_id].includes(event.team.id), "StatsBomb event team is not in this match.");
    ids.add(event.id);
    durations[event.period] = Math.max(durations[event.period] ?? 0, time + (finite(event.duration) && event.duration > 0 ? event.duration : 0));
  }
  const offsets = {};
  let elapsed = 0;
  for (const period of Object.keys(durations).map(Number).sort((a, b) => a - b)) {
    offsets[period] = elapsed;
    elapsed += durations[period];
  }
  let previousPossession = null;
  const normalized = [...events].sort((a, b) => a.index - b.index).map((event) => {
    const shotXG = event.shot?.statsbomb_xg;
    requireValue(shotXG === undefined || (finite(shotXG) && shotXG >= 0 && shotXG <= 1), "StatsBomb shot xG must be between zero and one.");
    const changed = previousPossession !== null && event.possession !== previousPossession;
    previousPossession = event.possession;
    return {
      id: event.id, index: event.index, type: event.type.name, period: event.period,
      clock: event.timestamp, minute: event.minute, second: event.second,
      elapsedSeconds: round(offsets[event.period] + seconds(event.timestamp)),
      phase: event.period === 5 ? "shootout" : "match", teamId: event.team.id,
      teamName: event.team.name, playerId: event.player?.id ?? null,
      playerName: event.player?.name ?? null, location: location(event.location),
      underPressure: event.under_pressure === true, counterpress: event.counterpress === true,
      positionName: event.position?.name ?? null,
      bodyPart: event.pass?.body_part?.name ?? event.shot?.body_part?.name ?? null,
      possession: event.possession ?? null, possessionChanged: changed,
      pass: event.pass ? { endLocation: location(event.pass.end_location), recipientId: event.pass.recipient?.id ?? null,
        completed: event.pass.outcome === undefined, outcome: event.pass.outcome?.name ?? "Complete",
        shotAssist: event.pass.shot_assist === true, goalAssist: event.pass.goal_assist === true, cross: event.pass.cross === true } : null,
      carry: event.carry ? { endLocation: location(event.carry.end_location) } : null,
      shot: event.shot ? { xg: shotXG ?? null, outcome: event.shot.outcome?.name ?? null,
        isPenalty: event.shot.type?.name === "Penalty", endLocation: location(event.shot.end_location) } : null,
      substitution: event.substitution ? { replacementId: event.substitution.replacement.id,
        replacementName: event.substitution.replacement.name } : null,
      card: event.foul_committed?.card?.name ?? event.bad_behaviour?.card?.name ?? null,
    };
  });

  const players = lineups.flatMap((team) => team.lineup.map((player) => {
    const own = normalized.filter((event) => event.playerId === player.player_id && event.period <= 4);
    const passes = own.filter(({ type }) => type === "Pass");
    const shots = own.filter(({ type }) => type === "Shot");
    const minutes = minutesPlayed(player.positions, durations, offsets);
    const stats = {
      passesAttempted: passes.length, passesCompleted: passes.filter(({ pass }) => pass?.completed).length,
      progressivePasses: passes.filter(({ pass, location: start }) => pass?.completed && start && pass.endLocation
        && pass.endLocation.x - start.x >= 10).length,
      keyPasses: passes.filter(({ pass }) => pass?.shotAssist).length,
      assists: passes.filter(({ pass }) => pass?.goalAssist).length,
      carries: own.filter(({ type }) => type === "Carry").length,
      pressures: own.filter(({ type }) => type === "Pressure").length,
      recoveries: own.filter(({ type }) => type === "Ball Recovery").length,
      interceptionAttempts: own.filter(({ type }) => type === "Interception").length,
      shots: shots.length, goals: shots.filter(({ shot }) => shot?.outcome === "Goal").length,
      ownGoals: own.filter(({ type }) => type === "Own Goal Against").length,
      xg: shots.some(({ shot }) => shot?.xg === null) ? null : round(shots.reduce((sum, { shot }) => sum + (shot?.xg ?? 0), 0)),
    };
    return { id: `statsbomb:${player.player_id}`, providerId: player.player_id,
      name: player.player_nickname || player.player_name, fullName: player.player_name,
      country: player.country?.name ?? null, teamId: team.team_id, teamName: team.team_name,
      starter: events.some((e) => e.type.name === "Starting XI" && e.team.id === team.team_id
        && e.tactics?.lineup?.some((p) => p.player.id === player.player_id)),
      jerseyNumber: Number.isInteger(player.jersey_number) && player.jersey_number > 0 ? player.jersey_number : null, positions: [...new Set((player.positions ?? []).map(({ position }) => position))],
      minutesPlayed: minutes, stats,
      per90: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key,
        minutes > 0 && value !== null ? round(value * 90 / minutes) : null])),
      sample: "one match including stoppage time; shootouts excluded", dataKind: "OBSERVED / DERIVED" };
  }));
  requireValue(new Set(players.map(({ id }) => id)).size === players.length, "Duplicate StatsBomb lineup player.");
  const homeId = metadata.home_team.home_team_id;
  const shots = normalized.filter(({ type, period }) => type === "Shot" && period <= 4);
  const bins = [];
  for (const period of Object.keys(durations).map(Number).filter((p) => p <= 4).sort((a, b) => a - b)) {
    const periodBins = Array.from({ length: Math.floor(durations[period] / 60) + 1 }, (_, index) => ({
      period, periodMinute: index, elapsedSeconds: offsets[period] + index * 60, homeXG: 0, awayXG: 0,
    }));
    for (const event of shots.filter((shot) => shot.period === period)) {
      if (event.shot.xg === null) continue;
      const bin = periodBins[Math.floor(seconds(event.clock) / 60)];
      bin[event.teamId === homeId ? "homeXG" : "awayXG"] += event.shot.xg;
    }
    for (let index = 0; index < periodBins.length; index += 1) {
      const window = periodBins.slice(Math.max(0, index - 4), index + 1);
      const homeXG = window.reduce((sum, bin) => sum + bin.homeXG, 0);
      const awayXG = window.reduce((sum, bin) => sum + bin.awayXG, 0);
      bins.push({ ...periodBins[index], homeXG: round(homeXG), awayXG: round(awayXG), difference: homeXG - awayXG });
    }
  }
  const peak = Math.max(...bins.map(({ difference }) => Math.abs(difference)), 0);
  const points = bins.map((bin) => ({ ...bin, value: peak ? round(bin.difference / peak) : 0 }));
  let homeXG = 0;
  let awayXG = 0;
  const cumulativeXG = shots.map((event) => {
    if (event.teamId === homeId) homeXG += event.shot.xg ?? 0;
    else awayXG += event.shot.xg ?? 0;
    return { eventId: event.id, period: event.period, minute: event.minute, second: event.second,
      elapsedSeconds: event.elapsedSeconds, homeXG: round(homeXG), awayXG: round(awayXG) };
  });
  const keyMoments = normalized.filter((event) => event.period <= 4 && (event.shot || event.type === "Own Goal Against" || event.card?.includes("Red")))
    .map((event) => ({ eventId: event.id, period: event.period, minute: event.minute, second: event.second,
      elapsedSeconds: event.elapsedSeconds, type: event.type, teamName: event.teamName, playerName: event.playerName,
      xg: event.shot?.xg ?? null, outcome: event.shot?.outcome ?? (event.type === "Own Goal Against" ? "Own goal against" : event.card),
      importance: (event.shot?.xg ?? 0) + (event.shot?.outcome === "Goal" || event.type === "Own Goal Against" ? 2 : 0) + (event.card?.includes("Red") ? 1 : 0) }))
    .sort((a, b) => b.importance - a.importance || a.elapsedSeconds - b.elapsedSeconds).slice(0, 10);
  return {
    id: `statsbomb:${metadata.match_id}`, providerId: metadata.match_id, name: `${metadata.home_team.home_team_name} vs ${metadata.away_team.away_team_name}`,
    date: metadata.match_date, competition: metadata.competition?.competition_name ?? null,
    season: metadata.season?.season_name ?? null, gender: metadata.home_team.home_team_gender,
    stadium: metadata.stadium?.name ?? null,
    home: { id: homeId, name: metadata.home_team.home_team_name, score: metadata.home_score },
    away: { id: metadata.away_team.away_team_id, name: metadata.away_team.away_team_name, score: metadata.away_score },
    pitch: { length: 105, width: 68 }, coordinateSystem: "StatsBomb 120x80 scaled to 105x68; actor-relative attacking direction, not global tracking",
    capabilities: { eventAnalytics: true, trackingReplay: false, ghostComparison: false },
    events: normalized, players, keyMoments,
    momentum: { points, cumulativeXG, totals: { homeXG: round(homeXG), awayXG: round(awayXG) },
      missingShotXG: shots.filter(({ shot }) => shot.xg === null).length,
      method: "Trailing five one-minute xG bins, separately per period; Home minus Away, normalized by peak absolute difference. Cumulative xG uses recorded shot xG. Shootouts excluded. Not a match-result prediction." },
    statsMethod: "Counts from events; per90 divides by union of lineup position intervals including stoppage/extra time. Progressive pass proxy: completed pass gains at least 10 metres toward the opponent goal. One match is not a season scouting sample.",
  };
}
