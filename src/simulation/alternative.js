import { arriveVelocity, interceptionTarget } from "./movement.js";

const PROJECTION_SECONDS = 1.5;

export function simulateAlternative({ match, momentId, candidateId }) {
  const moment = match.moments.find(({ id }) => id === momentId);
  const player = match.players.find(({ id }) => id === candidateId);
  if (!moment || !player?.settings || !moment.candidatePlayerIds?.includes(candidateId)) {
    throw new Error("Choose a candidate from this moment's shortlist.");
  }

  const { settings } = player;
  const baselineFrames = moment.frames;
  const { targetPlayerId, initialVelocity, action, anchor, ballLead } = moment;
  const cueTime = baselineFrames.find(({ sourceFrame }) => sourceFrame === action.startFrame).time;
  const tacticalPoints = baselineFrames.map(({ ball }) => ballLead === undefined ? anchor
    : { x: Math.min(anchor.x, ball.x + ballLead), y: anchor.y });
  const engagedFrames = baselineFrames.map(() => false);
  let position = { ...baselineFrames[0].players[targetPlayerId] };
  let velocity = { x: 0, y: 0, ...initialVelocity };
  const alternativeFrames = baselineFrames.map((frame, index) => {
    if (index > 0) {
      const previous = baselineFrames[index - 1];
      const dt = frame.time - previous.time;
      const tacticalPoint = tacticalPoints[index];
      let target = tacticalPoint;
      if (frame.time >= cueTime + settings.reaction && frame.sourceFrame < action.endFrame) {
        const reachable = interceptionTarget({ position, velocity, ball: frame.ball, previousBall: previous.ball, dt,
          tacticalPoint, settings, pitch: match.pitch, horizon: PROJECTION_SECONDS });
        if (reachable) {
          target = reachable;
          engagedFrames[index] = true;
        }
      }
      velocity = arriveVelocity(position, velocity, target, settings, dt);
      position = {
        x: Math.min(match.pitch.length, Math.max(0, position.x + velocity.x * dt)),
        y: Math.min(match.pitch.width, Math.max(0, position.y + velocity.y * dt)),
      };
    }

    const { [targetPlayerId]: outgoing, ...teammatesAndOpponents } = frame.players;
    return { ...frame, players: { ...teammatesAndOpponents, [candidateId]: position } };
  });

  const name = player.scouting?.name ?? player.displayName;
  const fixed = (value) => Number(value).toFixed(2);
  return {
    baselineFrames, alternativeFrames, outgoingPlayerId: targetPlayerId, incomingPlayerId: candidateId,
    tacticalPoints, engagedFrames,
    assumptions: [
      "The replacement starts at the recorded player's position and estimated velocity.",
      `${name} (${player.age}) moves with his 2024/25 A-League measurements (SkillCorner): top speed ${fixed(settings.topSpeed)} m/s, acceleration ${fixed(settings.acceleration)} m/s², reaction ${fixed(settings.reaction)} s, engage range ${fixed(settings.engageRange)} m.`,
      `After the cue and his reaction delay, he goes for the ball only when he can reach its projected path (next ${PROJECTION_SECONDS} s, from its last two positions) within ${fixed(settings.engageRange)} m of his tactical point; otherwise he holds that point.`,
      "The ball and all other players follow their recorded paths. The modeled run does not change possession or score.",
    ],
  };
}
