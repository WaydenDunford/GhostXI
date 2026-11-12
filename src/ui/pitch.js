const TEAM_COLORS = { HOME: "#78caff", AWAY: "#ffad85" };
const LINE_COLOR = "#79a597";
const PLAYER_RADIUS = 1.12;

export function createPitch(canvas, match) {
  const context = canvas.getContext("2d");
  const { length, width } = match.pitch;
  const players = new Map(match.players.map((player) => [player.id, player]));
  let scene = {};

  function paint() {
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    if (!context || !cssWidth || !cssHeight) return;

    const pixelRatio = canvas.ownerDocument.defaultView.devicePixelRatio || 1;
    const pixelWidth = Math.round(cssWidth * pixelRatio);
    const pixelHeight = Math.round(cssHeight * pixelRatio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const scale = Math.min(pixelWidth / (length + 8), pixelHeight / (width + 8));
    const offsetX = (pixelWidth - length * scale) / 2;
    const offsetY = (pixelHeight - width * scale) / 2;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#102d2a";
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    drawField(context, length, width);

    const { frame, ghostPosition, ghostId, highlightedId, modeledGhost, coverPoint, trails = [] } = scene;
    if (!frame) return;

    if (coverPoint) drawCoverPoint(context, coverPoint);
    for (const trail of trails) {
      context.beginPath(); context.strokeStyle = trail.color ?? "#d8ff9b"; context.lineWidth = .35;
      context.setLineDash(trail.simulated ? [1, .7] : []);
      for (const [index, p] of trail.points.filter(Boolean).entries()) index ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y);
      context.stroke(); context.setLineDash([]);
    }

    for (const [id, position] of Object.entries(frame.players)) {
      if (!position) continue;
      const player = players.get(id);
      drawPlayer(context, position, TEAM_COLORS[player?.team] ?? "#d8e0ea", id === highlightedId);
    }

    if (ghostPosition) {
      const player = players.get(ghostId);
      drawGhost(context, ghostPosition, modeledGhost ? "#d8ff9b" : (TEAM_COLORS[player?.team] ?? "#d8e0ea"));
    }

    if (!frame.ball) return;
    circle(context, frame.ball.x, frame.ball.y, 0.57);
    context.fillStyle = "#fff";
    context.fill();
    context.strokeStyle = "#14252d";
    context.lineWidth = 0.23;
    context.stroke();
  }

  const observer = new ResizeObserver(paint);
  observer.observe(canvas);

  return {
    render(nextScene) {
      scene = nextScene;
      paint();
    },
    destroy() {
      observer.disconnect();
    },
  };
}

function circle(context, x, y, radius) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
}

function drawField(context, length, width) {
  const middle = width / 2;
  const stripeWidth = length / 10;
  for (let index = 0; index < 10; index += 1) {
    context.fillStyle = index % 2 === 0 ? "#1c4c40" : "#205345";
    context.fillRect(index * stripeWidth, 0, stripeWidth, width);
  }

  context.strokeStyle = LINE_COLOR;
  context.lineWidth = 0.19;
  context.strokeRect(0, 0, length, width);
  context.beginPath();
  context.moveTo(length / 2, 0);
  context.lineTo(length / 2, width);
  context.stroke();
  circle(context, length / 2, middle, 9.15);
  context.stroke();
  drawSpot(context, length / 2, middle);

  const arcAngle = Math.acos((16.5 - 11) / 9.15);
  context.strokeRect(0, middle - 20.16, 16.5, 40.32);
  context.strokeRect(length - 16.5, middle - 20.16, 16.5, 40.32);
  context.strokeRect(0, middle - 9.16, 5.5, 18.32);
  context.strokeRect(length - 5.5, middle - 9.16, 5.5, 18.32);
  context.strokeRect(-2.1, middle - 3.66, 2.1, 7.32);
  context.strokeRect(length, middle - 3.66, 2.1, 7.32);
  context.beginPath();
  context.arc(11, middle, 9.15, -arcAngle, arcAngle);
  context.stroke();
  context.beginPath();
  context.arc(length - 11, middle, 9.15, Math.PI - arcAngle, Math.PI + arcAngle);
  context.stroke();
  drawSpot(context, 11, middle);
  drawSpot(context, length - 11, middle);
}

function drawSpot(context, x, y) {
  circle(context, x, y, 0.23);
  context.fillStyle = LINE_COLOR;
  context.fill();
}

function drawCoverPoint(context, { x, y }) {
  context.beginPath();
  context.moveTo(x - 1, y);
  context.lineTo(x + 1, y);
  context.moveTo(x, y - 1);
  context.lineTo(x, y + 1);
  context.lineWidth = 0.25;
  context.strokeStyle = "#f1f6ee";
  context.stroke();
}

function drawPlayer(context, { x, y }, color, replacement) {
  circle(context, x, y, PLAYER_RADIUS);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#10272b";
  context.lineWidth = 0.28;
  context.stroke();

  if (replacement) {
    circle(context, x, y, 1.52);
    context.strokeStyle = "#d8ff9b";
    context.lineWidth = 0.27;
    context.stroke();
  }
}

function drawGhost(context, { x, y }, color) {
  context.save();
  circle(context, x, y, 1.96);
  context.globalAlpha = 0.35;
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#fff";
  context.lineWidth = 0.4;
  context.setLineDash([0.65, 0.34]);
  context.stroke();
  context.restore();
}
