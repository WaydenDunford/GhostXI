import { normalizeStatsBombMatch } from "../src/data/statsbomb.js";
import { DomainError, requireValue } from "../src/domain/validation.js";
import { eventTags } from "../src/recommendation/ranking.js";
import { classifyPosition, footballRecommendation as config } from "../src/recommendation/config.js";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sbId = (id) => `statsbomb:${id}`;

export function createMatchContexts(recording, external) {
  const contexts = new Map();
  const metricaPlayers = recording.players.map((player) => ({ id: player.id, name: player.displayName,
    position: player.role ?? "unknown", secondaryPositions: [], teamId: player.team, source: "metrica", dataStatus: "observed" }));
  contexts.set(recording.id, {
    id: recording.id, kind: "tracking", gender: null, source: recording.source, recording,
    players: metricaPlayers,
    activeAt: () => new Map([...recording.lineup.home, ...recording.lineup.away].map((id) => [id, metricaPlayers.find((p) => p.id === id)])),
    windows(playerId) {
      return recording.moments.map((moment) => {
        const frame = moment.frames.find(({ sourceFrame }) => sourceFrame === moment.action.startFrame);
        const playerDistance = distance(frame.players[playerId], frame.ball);
        const cueTime = moment.startTime + frame.time;
        const momentumAt = (time) => recording.momentum?.[Math.floor(Math.max(0, time) / 60)]?.value ?? 0;
        return { id: moment.id, period: moment.period ?? 1, startSec: moment.startTime, endSec: moment.startTime + moment.durationSec,
          timeSec: moment.startTime + frame.time, title: moment.title, description: moment.description,
          tags: moment.context === "attack" ? ["shooting", "progressive_pass", "attacking_run", "space_creation"]
            : moment.context === "press" ? ["defensive_transition", "marking", "pressured_pass"] : ["interception", "possession_recovery"],
          momentumDelta: momentumAt(cueTime + 60) - momentumAt(cueTime - 60),
          involvement: moment.targetPlayerId === playerId ? 1 : clamp(1 - playerDistance / 20, 0, 0.7),
          opportunity: 0.8, dataStatus: "observed", dataCoverage: 1,
          evidence: moment.targetPlayerId === playerId ? "The recorded player is directly involved in the selected action." : `Tracked ball distance at the cue: ${playerDistance.toFixed(2)} m.`, moment };
      });
    },
  });
  for (const raw of external?.statsbomb?.matches ?? []) {
    const match = normalizeStatsBombMatch(raw);
    const players = raw.lineups.flatMap((team) => team.lineup.map((player) => ({
      id: sbId(player.player_id), name: player.player_nickname || player.player_name,
      position: player.positions?.[0]?.position ?? "unknown",
      secondaryPositions: [...new Set((player.positions ?? []).slice(1).map(({ position }) => position))],
      teamId: team.team_id, source: "statsbomb", dataStatus: "observed", providerId: player.player_id,
    })));
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const normalizedById = new Map(match.events.map((event) => [event.id, event]));
    const snapshots = [];
    const active = new Map();
    for (const event of raw.events) {
        const normalized = normalizedById.get(event.id);
        if (!normalized) continue;
        let changed = false;
        if (event.tactics?.lineup) {
          changed = true;
          for (const [id, player] of active) if (player.teamId === event.team.id) active.delete(id);
          for (const slot of event.tactics.lineup) {
            const known = playerMap.get(sbId(slot.player.id));
            if (known) active.set(known.id, { ...known, position: slot.position.name });
          }
        }
        if (normalized.substitution) {
          changed = true;
          const previous = active.get(sbId(normalized.playerId));
          active.delete(sbId(normalized.playerId));
          const next = playerMap.get(sbId(normalized.substitution.replacementId));
          if (next) active.set(next.id, { ...next, position: previous?.position ?? next.position });
        }
        if (normalized.card === "Red Card" || normalized.card === "Second Yellow") {
          changed = true; active.delete(sbId(normalized.playerId));
        }
        if (changed) snapshots.push({ time: normalized.elapsedSeconds, players: new Map(active) });
    }
    function activeAt(timeSec) {
      return new Map([...snapshots].reverse().find(({ time }) => time <= timeSec)?.players ?? []);
    }
    const periodBounds = Object.fromEntries([...new Set(match.events.map(({ period }) => period))].map((period) => {
      const times = match.events.filter((event) => event.period === period).map(({ elapsedSeconds }) => elapsedSeconds);
      return [period, { start: Math.min(...times), end: Math.max(...times) }];
    }));
    const rawById = new Map(raw.events.map((event) => [event.id, event]));
    const windowCache = new Map();
    const context = { id: match.id, kind: "events", gender: match.gender, source: { name: "StatsBomb Open Data", url: "https://github.com/hudl/open-data", revision: external.statsbomb.revision },
      date: match.date, raw, match, players, playerMap, activeAt, periodBounds,
      windows(playerId) {
        if (windowCache.has(playerId)) return windowCache.get(playerId);
        const selected = playerMap.get(playerId);
        const windows = match.events.filter((event) => event.period <= 4 && event.location && eventTags(event).length > 0).flatMap((event) => {
          const bounds = periodBounds[event.period];
          if (bounds.end - bounds.start < config.windowSeconds) return [];
          const startSec = clamp(event.elapsedSeconds - 3, bounds.start, bounds.end - config.windowSeconds);
          const endSec = startSec + config.windowSeconds;
          const active = activeAt(startSec);
          const endActive = activeAt(endSec - 0.001);
          if (!active.has(playerId) || active.size !== 22 || ![...active.keys()].every((id) => endActive.has(id))) return [];
          const points = match.momentum.points.filter((point) => point.period === event.period);
          const at = (time) => [...points].reverse().find(({ elapsedSeconds }) => elapsedSeconds <= time)?.difference ?? 0;
          const delta = at(event.elapsedSeconds + 60) - at(Math.max(bounds.start, event.elapsedSeconds - 60));
          const directly = event.playerId === selected.providerId;
          const recipient = event.pass?.recipientId === selected.providerId;
          return [{ id: `event:${event.id}`, period: event.period, startSec, endSec, timeSec: event.elapsedSeconds,
            title: `${event.type} · ${event.minute}:${String(event.second).padStart(2, "0")} · ${event.playerName ?? event.teamName}`,
            description: `Recorded ${event.type.toLowerCase()} by ${event.playerName ?? event.teamName}. Review a modeled substitution around this event.`,
            tags: eventTags(event), momentumDelta: delta, involvement: directly ? 1 : recipient ? 0.85 : event.teamId === selected.teamId ? 0.25 : 0.1,
            opportunity: event.shot ? clamp(0.5 + (event.shot.xg ?? 0), 0, 1) : event.underPressure ? 0.95 : 0.7,
            dataStatus: "estimated", dataCoverage: config.coverage.eventTimeline + config.coverage.knownLineup + config.coverage.actorLocation,
            evidence: directly ? "The selected player is the event actor." : recipient ? "The selected player is the recorded pass recipient." : "Role/context relevance; no measured proximity to this event is available.",
            event, rawEvent: rawById.get(event.id), active }];
        });
        windowCache.set(playerId, windows);
        return windows;
      },
    };
    contexts.set(match.id, context);
  }
  return contexts;
}

export function requireContext(contexts, matchId) {
  const key = /^\d+$/.test(String(matchId)) ? sbId(matchId) : matchId;
  const context = contexts.get(key);
  if (!context) throw new DomainError("Match data is unavailable. Use a catalog match ID and prepare its data first.", "MATCH_NOT_FOUND", 404);
  return context;
}

/** Formation templates are explicitly estimated, with one event actor/location anchored. */
export function reconstructWindow(context, window, playerId, candidateId) {
  const active = context.activeAt(window.startSec);
  requireValue(active.size === 22 && active.has(playerId), "This window needs 22 known active players including the selected player.");
  const endActive = context.activeAt(window.endSec - 0.001);
  requireValue([...active.keys()].every((id) => endActive.has(id)), "The reconstruction cannot cross a substitution or sending-off.");
  const selected = active.get(playerId);
  const homeTeam = context.match.home.id;
  const selectedTeam = selected.teamId;
  const byTeam = [homeTeam, context.match.away.id].map((teamId) => [...active.values()].filter((p) => p.teamId === teamId));
  const base = {};
  for (const squad of byTeam) {
    const groups = {};
    for (const player of squad) {
      const role = classifyPosition(player.position) ?? "midfielder";
      (groups[role] ??= []).push(player);
    }
    for (const [role, group] of Object.entries(groups)) group.forEach((player, i) => {
      const x = { goalkeeper: 7, defender: 27, midfielder: 52, winger: 70, striker: 83 }[role];
      const y = group.length === 1 ? 34 : 8 + i * 52 / (group.length - 1);
      base[player.id] = player.teamId === homeTeam ? { x, y } : { x: 105 - x, y: 68 - y };
    });
  }
  const event = window.event;
  const globalPoint = (point) => {
    const p = event.teamId === homeTeam ? point : { x: 105 - point.x, y: 68 - point.y };
    return { x: clamp(p.x, 0, 105), y: clamp(p.y, 0, 68) };
  };
  const start = globalPoint(event.location);
  const end = globalPoint(event.pass?.endLocation ?? event.carry?.endLocation ?? event.shot?.endLocation ?? event.location);
  const actorId = sbId(event.playerId);
  if (Object.hasOwn(base, actorId)) base[actorId] = { ...start };
  const recipientId = event.pass?.recipientId ? sbId(event.pass.recipientId) : null;
  if (recipientId && Object.hasOwn(base, recipientId)) base[recipientId] = { ...end };
  const eventTime = event.elapsedSeconds - window.startSec;
  const eventDuration = clamp(window.rawEvent?.duration ?? 1, 0.2, 3);
  const frames = Array.from({ length: 201 }, (_, index) => {
    const time = index / 25;
    const ratio = clamp((time - eventTime) / eventDuration, 0, 1);
    const ball = { x: start.x + ratio * (end.x - start.x), y: start.y + ratio * (end.y - start.y) };
    const players = structuredClone(base);
    if (event.carry && Object.hasOwn(players, actorId)) players[actorId] = { ...ball };
    return { sourceFrame: index, time, ball, players };
  });
  const role = classifyPosition(selected.position) ?? "midfielder";
  const selectedAttacksRight = selectedTeam === homeTeam;
  const direction = selectedAttacksRight ? 1 : -1;
  const anchor = { x: clamp(start.x + direction * (role === "defender" ? -4 : 5), 0, 105), y: clamp(start.y + (34 - start.y) * 0.2, 0, 68) };
  const moment = { id: window.id, context: role === "defender" || role === "goalkeeper" ? "press" : "attack",
    targetPlayerId: playerId, candidatePlayerIds: [candidateId], durationSec: 8, frames, anchor,
    initialVelocity: { x: 0, y: 0 }, period: 1,
    action: { startFrame: Math.min(198, Math.max(0, Math.round(eventTime * 25))),
      endFrame: Math.min(200, Math.max(1, Math.round((eventTime + eventDuration) * 25))), team: event.teamId === selectedTeam ? "HOME" : "AWAY" } };
  if (moment.action.endFrame <= moment.action.startFrame) moment.action.endFrame = moment.action.startFrame + 1;
  return { id: context.id, pitch: { length: 105, width: 68 }, fps: 25,
    homeAttacksRightFirstHalf: selectedAttacksRight, players: [...active.values()].map((p) => ({ id: p.id, displayName: p.name, team: p.teamId === selectedTeam ? "HOME" : "AWAY" })),
    lineup: { home: [...active.values()].filter((p) => p.teamId === selectedTeam).map((p) => p.id), away: [...active.values()].filter((p) => p.teamId !== selectedTeam).map((p) => p.id) },
    moments: [moment] };
}
