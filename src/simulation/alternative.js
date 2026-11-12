export const replacementProfiles = [
  {
    id: "lane-reader", displayName: "Lane reader (modeled)", team: "HOME", role: "central midfielder", age: 19,
    traits: { pace: 70, positioning: 84, defending: 75, passing: 82, stamina: 78 },
    acceleration: 5, reaction: 0.16, stepOut: 5,
  },
  {
    id: "patient-cover", displayName: "Patient cover (modeled)", team: "HOME", role: "full-back", age: 22,
    traits: { pace: 50, positioning: 79, defending: 88, passing: 62, stamina: 74 },
    acceleration: 4, reaction: 0.48, stepOut: 2.5,
  },
  {
    id: "wide-runner", displayName: "Wide runner (modeled)", team: "HOME", role: "winger", age: 20,
    traits: { pace: 90, positioning: 74, defending: 60, passing: 73, stamina: 84 },
    acceleration: 5.8, reaction: 0.20, stepOut: 7,
  },
];

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
  const { targetPlayerId, initialVelocity, action, anchor, ballLead } = moment;
  const cueTime = baselineFrames.find(({ sourceFrame }) => sourceFrame === action.startFrame).time;
  const maxSpeed = 3 + profile.traits.pace / 25;
  const tacticalPoints = baselineFrames.map(({ ball }) => ballLead === undefined ? anchor
    : { x: Math.min(anchor.x, ball.x + ballLead), y: anchor.y });
  let position = { ...baselineFrames[0].players[targetPlayerId] };
  let velocity = { ...initialVelocity };
  const alternativeFrames = baselineFrames.map((frame, index) => {
    if (index > 0) {
      const previous = baselineFrames[index - 1];
      const dt = frame.time - previous.time;
      const point = tacticalPoints[index];
      let target = point;
      if (frame.time >= cueTime + profile.reaction && frame.sourceFrame < action.endFrame) {
        const ballVelocity = capVector((frame.ball.x - previous.ball.x) / dt, (frame.ball.y - previous.ball.y) / dt, 30);
        const offset = capVector(frame.ball.x + ballVelocity.x * LEAD_SECONDS - point.x,
          frame.ball.y + ballVelocity.y * LEAD_SECONDS - point.y, profile.stepOut);
        target = { x: point.x + offset.x, y: point.y + offset.y };
      }
      const desired = capVector((target.x - position.x) * 3, (target.y - position.y) * 3, maxSpeed);
      const change = capVector(desired.x - velocity.x, desired.y - velocity.y, profile.acceleration * dt);
      velocity = { x: velocity.x + change.x, y: velocity.y + change.y };
      position = {
        x: Math.min(match.pitch.length, Math.max(0, position.x + velocity.x * dt)),
        y: Math.min(match.pitch.width, Math.max(0, position.y + velocity.y * dt)),
      };
    }

    const { [targetPlayerId]: outgoing, ...teammatesAndOpponents } = frame.players;
    return { ...frame, players: { ...teammatesAndOpponents, [candidateId]: position } };
  });

  return {
    baselineFrames, alternativeFrames, outgoingPlayerId: targetPlayerId, incomingPlayerId: candidateId,
    tacticalPoints,
    assumptions: [
      "The replacement starts at the recorded player's position and estimated velocity.",
      `The hypothetical profile is a ${profile.age}-year-old ${profile.role}, with a target top speed of ${maxSpeed.toFixed(1)} m/s and a ${profile.reaction} s reaction delay.`,
      `The model steers at most ${profile.stepOut} m away from the assigned tactical point when reacting to the ball.`,
      "The ball and all other players follow their recorded paths. The modeled run does not change possession or score.",
    ],
  };
}
