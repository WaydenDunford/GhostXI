// Movement rules for a modeled substitute, driven by his measured top speed, acceleration and
// engage range. Pure functions: positions in metres, speeds in m/s, times in seconds.
const BALL_SPEED_CAP = 30;

export function capVector(x, y, limit) {
  const length = Math.hypot(x, y);
  const scale = length > limit ? limit / length : 1;
  return { x: x * scale, y: y * scale };
}

// Time to cover `distance` starting at `approachSpeed` toward the point: accelerate up to top
// speed, then cruise.
export function timeToReach(distance, approachSpeed, acceleration, topSpeed) {
  const start = Math.min(topSpeed, Math.max(0, approachSpeed));
  const accelerationTime = (topSpeed - start) / acceleration;
  const accelerationDistance = start * accelerationTime + 0.5 * acceleration * accelerationTime ** 2;
  return distance <= accelerationDistance
    ? (Math.sqrt(start ** 2 + 2 * acceleration * distance) - start) / acceleration
    : accelerationTime + (distance - accelerationDistance) / topSpeed;
}

// Accelerate toward the target, braking only as much as needed to stop on it.
export function arriveVelocity(position, velocity, target, { topSpeed, acceleration }, dt) {
  const gapX = target.x - position.x;
  const gapY = target.y - position.y;
  const gap = Math.hypot(gapX, gapY);
  const speed = Math.min(topSpeed, Math.sqrt(2 * acceleration * gap));
  const desired = gap > 1e-6 ? { x: gapX / gap * speed, y: gapY / gap * speed } : { x: 0, y: 0 };
  const change = capVector(desired.x - velocity.x, desired.y - velocity.y, acceleration * dt);
  return { x: velocity.x + change.x, y: velocity.y + change.y };
}

// The earliest point on the ball's projected path (from its last two positions) that the player
// can reach before the ball does, within his engage range of the tactical point; otherwise null.
export function interceptionTarget({ position, velocity, ball, previousBall, dt, tacticalPoint, settings, pitch, horizon = 1.5 }) {
  const ballVelocity = capVector((ball.x - previousBall.x) / dt, (ball.y - previousBall.y) / dt, BALL_SPEED_CAP);
  const steps = Math.floor(horizon / dt + 1e-9);
  for (let step = 1; step <= steps; step += 1) {
    const time = step * dt;
    const point = { x: ball.x + ballVelocity.x * time, y: ball.y + ballVelocity.y * time };
    if (point.x < 0 || point.x > pitch.length || point.y < 0 || point.y > pitch.width) break;
    if (Math.hypot(point.x - tacticalPoint.x, point.y - tacticalPoint.y) > settings.engageRange) continue;
    const gapX = point.x - position.x;
    const gapY = point.y - position.y;
    const gap = Math.hypot(gapX, gapY);
    const approach = gap > 1e-9 ? (velocity.x * gapX + velocity.y * gapY) / gap : 0;
    if (timeToReach(gap, approach, settings.acceleration, settings.topSpeed) <= time) return point;
  }
  return null;
}
