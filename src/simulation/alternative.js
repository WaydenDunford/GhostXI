export const replacementProfiles = [
  { id: "lane-reader", displayName: "Lane reader (modeled)", team: "HOME", maxSpeed: 5.8, acceleration: 5, reaction: 0.16, stepOut: 5 },
  { id: "patient-cover", displayName: "Patient cover (modeled)", team: "HOME", maxSpeed: 5, acceleration: 4, reaction: 0.48, stepOut: 2.5 },
];

const COVER_POINT = Object.freeze({ x: 29, y: 54.5 });
const LEAD_SECONDS = 0.24;

function capVector(x, y, limit) {
  const length = Math.hypot(x, y);
  const scale = length > limit ? limit / length : 1;
  return { x: x * scale, y: y * scale };
}

export function simulateAlternative({ match, momentId, candidateId }) {
  const moment = match.moments.find(({ id }) => id === momentId);
  const profile = replacementProfiles.find(({ id }) => id === candidateId);
  if (!moment || !profile || !moment.candidatePlayerIds.includes(candidateId)) {
    throw new Error("Choose a replacement profile for this recorded moment.");
  }

  const baselineFrames = moment.frames;
  const { targetPlayerId, initialVelocity, interception } = moment;
  const releaseTime = baselineFrames.find(({ sourceFrame }) => sourceFrame === interception.releaseFrame).time;
  let position = { ...baselineFrames[0].players[targetPlayerId] };
  let velocity = { ...initialVelocity };
  const alternativeFrames = baselineFrames.map((frame, index) => {
    if (index > 0) {
      const previous = baselineFrames[index - 1];
      const dt = frame.time - previous.time;
      let target = COVER_POINT;
      if (frame.time >= releaseTime + profile.reaction && frame.sourceFrame < interception.recoveryFrame) {
        const ballVelocity = capVector((frame.ball.x - previous.ball.x) / dt, (frame.ball.y - previous.ball.y) / dt, 30);
        const offset = capVector(frame.ball.x + ballVelocity.x * LEAD_SECONDS - COVER_POINT.x,
          frame.ball.y + ballVelocity.y * LEAD_SECONDS - COVER_POINT.y, profile.stepOut);
        target = { x: COVER_POINT.x + offset.x, y: COVER_POINT.y + offset.y };
      }
      const desired = capVector((target.x - position.x) * 3, (target.y - position.y) * 3, profile.maxSpeed);
      const change = capVector(desired.x - velocity.x, desired.y - velocity.y, profile.acceleration * dt);
      velocity = { x: velocity.x + change.x, y: velocity.y + change.y };
      position = { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt };
    }

    const { [targetPlayerId]: outgoing, ...teammatesAndOpponents } = frame.players;
    return { ...frame, players: { ...teammatesAndOpponents, [candidateId]: position } };
  });

  return {
    baselineFrames, alternativeFrames, outgoingPlayerId: targetPlayerId, incomingPlayerId: candidateId,
    coverPoint: COVER_POINT,
    assumptions: [
      "The replacement starts at the recorded player's position and estimated velocity.",
      `The modeled reaction delay is ${profile.reaction} s, with a ${profile.stepOut} m step-out limit around the assigned cover point.`,
      "The ball and all other players follow their recorded paths. The modeled run does not change possession or score.",
    ],
  };
}
