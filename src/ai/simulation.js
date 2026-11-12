import { requireValue, validateMoment } from "../domain/validation.js";
import { behaviorContext } from "./profiles.js";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function cap(v, limit) {
  const scale = Math.min(1, limit / (Math.hypot(v.x, v.y) || 1));
  return { x: v.x * scale, y: v.y * scale };
}
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let x = Math.imul(state ^ state >>> 15, 1 | state);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
function laneDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return dist(point, { x: a.x + t * dx, y: a.y + t * dy });
}

export function simulateBehavior({ match, momentId, profile, seed = 42 }) {
  const moment = validateMoment(match, momentId);
  requireValue(moment.context === "attack" && match.homeAttacksRightFirstHalf === true, "The behavior MVP supports the recorded Home attacking scenario only.");
  requireValue(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, "seed must be an unsigned 32-bit integer.");
  requireValue(profile?.habits?.contexts && profile.physical?.provenance === "ASSUMED_SHARED_ROLE_PRIOR", "A fitted behavior profile is required.");
  const rng = random(seed);
  const fps = match.fps;
  requireValue(Number.isFinite(fps) && fps > 0 && fps <= 60, "A supported tracking frame rate is required.");
  const cueIndex = moment.frames.findIndex(({ sourceFrame }) => sourceFrame === moment.action.startFrame);
  // Start at the recorded receiving opportunity, so the experiment evaluates the
  // candidate's own on-ball choices rather than a generic teammate's initial pass.
  const startIndex = moment.frames.findIndex((f, index) => index >= cueIndex && dist(f.players[moment.targetPlayerId], f.ball) <= 1.6);
  requireValue(startIndex > 0, "No recorded receiving opportunity is available for this experiment.");
  const first = moment.frames[startIndex];
  const previous = moment.frames[startIndex - 1];
  const outgoing = moment.targetPlayerId;
  const incoming = profile.id;
  const durationSec = 8;
  const dt = 1 / fps;
  const bound = (p) => ({ x: clamp(p.x, 0, match.pitch.length), y: clamp(p.y, 0, match.pitch.width) });
  const originalId = (id) => id === incoming ? outgoing : id;
  const homeIds = match.lineup.home.map((id) => id === outgoing ? incoming : id);
  const awayIds = [...match.lineup.away];
  const ids = [...homeIds, ...awayIds];
  const home = (id) => homeIds.includes(id);
  const position = Object.fromEntries(ids.map((id) => [id, { ...first.players[originalId(id)] }]));
  const anchors = structuredClone(position);
  const velocity = Object.fromEntries(ids.map((id) => {
    const a = first.players[originalId(id)], b = previous.players[originalId(id)];
    return [id, cap({ x: (a.x - b.x) / (first.time - previous.time), y: (a.y - b.y) / (first.time - previous.time) }, id === incoming ? profile.physical.maxSpeed : 6.5)];
  }));
  let ball = { ...first.ball };
  let owner = incoming;
  requireValue(owner, "This scenario has no observed nearby Home ball carrier at the experiment start.");
  let flight = null;
  let terminal = null;
  const nextAction = Object.fromEntries(ids.map((id) => [id, 0]));
  const movement = Object.fromEntries(ids.map((id) => [id, { ...position[id] }]));
  const candidateSide = position[incoming].y < 34 ? -1 : 1;
  const decisions = [];
  const events = [];
  const metrics = { possessionSeconds: 0, touches: 1, passesAttempted: 0, carryDecisions: 0, shotsAttempted: 0, ballRecoveries: 0 };
  const frame = (time) => ({ time: Number(time.toFixed(4)), dataKind: "SIMULATED", ball: { ...ball },
    players: structuredClone(position), ballOwnerId: owner ?? null });
  const frames = [frame(0)];
  const opponents = (id) => home(id) ? awayIds : homeIds;
  const teammates = (id) => home(id) ? homeIds : awayIds;
  const nearestOpponent = (id, point = position[id]) => Math.min(...opponents(id).map((other) => dist(point, position[other])));
  const choose = (options) => options.map((option) => ({ ...option,
    selectionScore: option.score + 0.12 * -Math.log(-Math.log(clamp(rng(), 0.00001, 0.99999))) }))
    .sort((a, b) => b.selectionScore - a.selectionScore)[0];

  function passOption(id) {
    return teammates(id).filter((other) => other !== id && dist(position[id], position[other]) < 35)
      .map((other) => {
        const progress = (position[other].x - position[id].x) * (home(id) ? 1 : -1);
        const clearance = Math.min(...opponents(id).map((opponent) => laneDistance(position[opponent], position[id], position[other])));
        const lead = dist(position[id], position[other]) / 15;
        return { id: other, point: bound({ x: position[other].x + velocity[other].x * lead,
          y: position[other].y + velocity[other].y * lead }), risk: 1 - clamp(clearance / 4, 0, 1),
          score: 0.5 * clamp(progress / 15, -1, 1) + 0.6 * clamp(nearestOpponent(id, position[other]) / 6, 0, 1)
            - 0.5 * (1 - clamp(clearance / 4, 0, 1)) + (other === incoming ? 0.35 : 0) };
      }).sort((a, b) => b.score - a.score)[0];
  }

  function candidateOffBall(time) {
    const carrier = owner ? position[owner] : ball;
    const values = profile.habits;
    const choices = [
      { action: "hold_width", target: { x: carrier.x + 5, y: candidateSide < 0 ? 10 : 58 }, habit: values.wideActivity.value },
      { action: "cut_inside", target: { x: carrier.x + 7, y: position[incoming].y - candidateSide * 6 }, habit: values.carryInward.value },
      { action: "run_forward", target: { x: carrier.x + 11, y: position[incoming].y }, habit: values.carryForward.value },
      { action: "offer_support", target: { x: carrier.x + 4, y: carrier.y + candidateSide * 6 }, habit: values.actionMix.pass },
    ].map((option) => {
      const target = bound(option.target);
      const openness = clamp(nearestOpponent(incoming, target) / 7, 0, 1);
      const movementCost = clamp(dist(position[incoming], target) / 20, 0, 1);
      return { ...option, target, score: 1.8 * option.habit + 0.6 * openness - 0.5 * movementCost };
    });
    const selected = choose(choices);
    movement[incoming] = selected.target;
    decisions.push({ time, action: selected.action, target: selected.target, source: "Modeled off-ball transfer of on-ball preferences",
      reason: `Habit preference ${selected.habit.toFixed(3)}, with current opponent spacing and movement cost.`,
      options: choices.map(({ action, score, habit }) => ({ action, score, habit })) });
  }

  function onBall(id, time) {
    const candidate = id === incoming;
    const pressure = nearestOpponent(id) < 5;
    const context = behaviorContext(home(id) ? position[id].x : 105 - position[id].x, pressure);
    const prior = candidate ? profile.habits.contexts[context].probabilities : { pass: 0.65, carry: 0.30, shoot: 0.05 };
    const pass = passOption(id);
    const goalDistance = dist(position[id], { x: home(id) ? 105 : 0, y: 34 });
    const choices = [
      { action: "pass", score: pass ? Math.log(prior.pass) + pass.score + (pressure ? 0.3 : 0) : -100 },
      { action: "carry", score: Math.log(prior.carry) + (pressure ? -0.6 : 0.5) },
      { action: "shoot", score: goalDistance < 27 ? Math.log(prior.shoot) + (27 - goalDistance) / 8 : -100 },
    ];
    const selected = choose(choices);
    if (candidate) decisions.push({ time, action: selected.action, context, underPressure: pressure,
      source: "Smoothed player event mix + modeled tactical utility", prior,
      reason: `Historical ${context} preference combined with current passing lanes, pressure and goal distance.`,
      options: choices.map(({ action, score }) => ({ action, score })) });
    if (selected.action === "pass" && pass) {
      flight = { point: pass.point, receiver: pass.id, kicker: id, kickedAt: time, kind: "pass", speed: 15 };
      events.push({ time, type: "pass", playerId: id, receiverId: pass.id, modeledLaneRisk: pass.risk });
      if (candidate) metrics.passesAttempted += 1;
      owner = null;
    } else if (selected.action === "shoot") {
      flight = { point: { x: home(id) ? 105 : 0, y: 34 + (rng() - 0.5) * 5 }, kicker: id, kickedAt: time, kind: "shot", speed: 22 };
      events.push({ time, type: "shot_attempt", playerId: id });
      if (candidate) metrics.shotsAttempted += 1;
      owner = null;
    } else {
      const inward = candidate ? profile.habits.carryInward.value : 0.3;
      movement[id] = bound({ x: position[id].x + (home(id) ? 8 : -8), y: position[id].y + (34 - position[id].y) * inward });
      if (candidate) metrics.carryDecisions += 1;
    }
  }

  for (let index = 1; index <= Math.round(durationSec * fps); index += 1) {
    const time = index / fps;
    if (terminal) { frames.push(frame(time)); continue; }
    const possessionTeam = owner ? home(owner) : flight ? home(flight.kicker) : null;
    const nearestTwo = (team) => team.slice().sort((a, b) => dist(position[a], ball) - dist(position[b], ball)).slice(0, 2);
    const pressers = possessionTeam === null ? [...nearestTwo(homeIds), ...nearestTwo(awayIds)] : nearestTwo(possessionTeam ? awayIds : homeIds);
    for (const id of ids) {
      if (time + 1e-8 < nextAction[id]) continue;
      nextAction[id] = time + (id === incoming ? 0.4 : 0.8);
      if (id === owner) { onBall(id, time); continue; }
      if (flight?.receiver === id) {
        movement[id] = flight.point;
        if (id === incoming) decisions.push({ time, action: "receive_pass", target: { ...flight.point },
          source: "Generic pass-reception rule", reason: "Move to the modeled pass destination before selecting an on-ball action.", options: [] });
        continue;
      }
      if (id === incoming && possessionTeam) { candidateOffBall(time); continue; }
      if (home(id) !== possessionTeam && pressers.includes(id)) movement[id] = bound({ ...ball });
      else if (home(id) !== possessionTeam) {
        const marked = teammates(id).includes(incoming) ? owner : incoming;
        const markPoint = marked ? position[marked] : ball;
        movement[id] = bound({ x: anchors[id].x * 0.65 + markPoint.x * 0.35 + (home(id) ? -1 : 1),
          y: anchors[id].y * 0.7 + markPoint.y * 0.3 });
      } else movement[id] = bound({ x: anchors[id].x + (ball.x - first.ball.x) * 0.2,
        y: anchors[id].y + (ball.y - first.ball.y) * 0.15 });
    }
    for (const id of ids) {
      const maxSpeed = id === incoming ? profile.physical.maxSpeed : 6.5;
      const acceleration = id === incoming ? profile.physical.acceleration : 4;
      const desired = cap({ x: (movement[id].x - position[id].x) * 2, y: (movement[id].y - position[id].y) * 2 }, maxSpeed);
      const change = cap({ x: desired.x - velocity[id].x, y: desired.y - velocity[id].y }, acceleration * dt);
      velocity[id] = cap({ x: velocity[id].x + change.x, y: velocity[id].y + change.y }, maxSpeed);
      position[id] = bound({ x: position[id].x + velocity[id].x * dt, y: position[id].y + velocity[id].y * dt });
    }
    if (owner) {
      ball = bound({ x: position[owner].x + (home(owner) ? 0.4 : -0.4), y: position[owner].y });
      if (owner === incoming) metrics.possessionSeconds += dt;
      const tackler = opponents(owner).filter((id) => dist(position[id], ball) < 0.8)
        .sort((a, b) => dist(position[a], ball) - dist(position[b], ball))[0];
      if (tackler) {
        owner = tackler; nextAction[owner] = time + 0.25;
        events.push({ time, type: "modeled_tackle", playerId: owner });
        if (owner === incoming) { metrics.touches += 1; metrics.ballRecoveries += 1; }
      }
    } else if (flight) {
      const delta = { x: flight.point.x - ball.x, y: flight.point.y - ball.y };
      const step = cap(delta, flight.speed * dt);
      ball = bound({ x: ball.x + step.x, y: ball.y + step.y });
      const receiver = ids.filter((id) => !(id === flight.kicker && time - flight.kickedAt < 0.3)
        && dist(position[id], ball) < 1.2).sort((a, b) => dist(position[a], ball) - dist(position[b], ball))[0];
      if (receiver) {
        events.push({ time, type: home(receiver) === home(flight.kicker) ? "modeled_reception" : "modeled_interception", playerId: receiver });
        owner = receiver; flight = null; nextAction[owner] = time + 0.25;
        if (owner === incoming) metrics.touches += 1;
      } else if (dist(ball, flight.point) < 0.05) {
        if (flight.kind === "shot") terminal = { time, type: "shot_reached_goal_line", interpretation: "No goal probability or validated goalkeeper/ball-height model is available." };
        else {
          const target = flight.receiver;
          if (dist(position[target], ball) < 2) {
            owner = target; nextAction[owner] = time + 0.25;
            if (owner === incoming) metrics.touches += 1;
            events.push({ time, type: "modeled_reception", playerId: owner });
          } else events.push({ time, type: "loose_ball", interpretation: "The grounded pass stops at its modeled destination; agents can recover it." });
        }
        flight = null;
      }
    }
    if (!owner && !flight && !terminal) {
      const recovering = ids.filter((id) => dist(position[id], ball) < 1.2)
        .sort((a, b) => dist(position[a], ball) - dist(position[b], ball))[0];
      if (recovering) {
        owner = recovering; nextAction[owner] = time + 0.25;
        events.push({ time, type: "modeled_loose_ball_recovery", playerId: owner });
        if (owner === incoming) { metrics.touches += 1; metrics.ballRecoveries += 1; }
      }
    }
    frames.push(frame(time));
  }
  metrics.possessionSeconds = Number(metrics.possessionSeconds.toFixed(2));
  const referenceFrames = moment.frames.slice(startIndex).map((f) => ({ ...structuredClone(f), time: Number((f.time - first.time).toFixed(4)), dataKind: "OBSERVED" }));
  return {
    schemaVersion: "1.0", mode: "behavior-experiment", matchId: match.id, momentId, candidateId: incoming,
    seed, fps, durationSec, outgoingPlayerId: outgoing, incomingPlayerId: incoming,
    referenceFrames, alternativeFrames: frames, referenceAvailableUntilSec: referenceFrames.at(-1).time,
    recordedStartFrame: first.sourceFrame, branchStartTimeSec: first.time,
    recordedContextFrames: structuredClone(moment.frames), decisions, events, terminal,
    analysis: { metrics, decisionCounts: Object.fromEntries([...new Set(decisions.map(({ action }) => action))]
      .map((action) => [action, decisions.filter((decision) => decision.action === action).length])),
    reasoning: [`${profile.name}: ${profile.sample.actionEvents} pre-final action events from ${profile.sample.matchCount} matches.`,
      "Action selection uses the player's context-conditioned event preferences and the modeled scene's passing lanes, space and pressure.",
      "Both candidates share the same assumed kinematic limits. Other agents use generic support, marking and pressing rules."],
    confidence: "limited; behavior frequencies and modeled rollouts, not calibrated outcome predictions" },
    profileEvidence: { id: profile.id, sample: profile.sample, cutoffDate: profile.cutoffDate, validation: profile.validation },
    assumptions: [...profile.assumptions, "At the recorded first 1.6-metre receiving opportunity the candidate is assumed to control a grounded ball; height/control are not observed.",
      "All ball flight is modeled on the ground; proximity-based control/tackles are heuristic.",
      "Offside, body collisions, aerial duels, fouls, fatigue and validated goalkeeper behavior are outside this short experiment.",
      "The recorded reference ends before the modeled continuation. Do not freeze/extend it and label it observed.",
      "Passing initially gives a small common preference to the replacement to make this a focused substitution experiment."],
  };
}
