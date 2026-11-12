// Text lines for the scouting card of a real candidate (players with a `scouting` record).
// Pure: the dashboard turns each { className, text } into a paragraph.
const GROUP_PLURAL = { "Central Defender": "centre-backs", "Full Back": "full-backs", "Wide Attacker": "wide attackers" };
const oneDecimal = (value) => Number(value).toFixed(1);
const percent = (share) => Math.round(100 * share);

export function formatEuros(eur) {
  return eur >= 1_000_000 ? `€${(eur / 1_000_000).toFixed(1)}m` : `€${Math.round(eur / 1000)}k`;
}

function valueLine(value) {
  if (!value) return "No 2024/25 valuation";
  return value.older
    ? `No 2024/25 valuation · older value ${formatEuros(value.eur)} (${value.date}, ${value.club})`
    : `Market value ${formatEuros(value.eur)} (${value.date})`;
}

function nationalLine({ caps, goals, team, citizenship }) {
  if (!caps) return "No international caps";
  return team
    ? `${caps} caps, ${goals} goals for ${team}`
    : `${caps} international caps (may include youth caps) · citizenship ${citizenship}`;
}

export function scoutingCardLines(player) {
  const card = player?.scouting;
  if (!card) return [];
  const { transfermarkt: tm, measured, national } = card;
  const group = GROUP_PLURAL[card.positionGroup] ?? card.positionGroup.toLowerCase();
  const lines = [
    ["gx-card-name", card.name],
    ["gx-card-club", card.clubNow ? `${card.club} · now at ${card.clubNow}` : card.club],
    ["gx-card-facts", tm
      ? [`Age ${card.age}`, tm.subPosition ?? tm.position ?? card.positionGroup, tm.foot && `${tm.foot}-footed`,
        tm.heightCm && `${tm.heightCm} cm`].filter(Boolean).join(" · ")
      : `Age ${card.age} · ${card.positionGroup} · no Transfermarkt record`],
    ["gx-card-value", valueLine(tm?.marketValue)],
    ["gx-card-speed", `Top speed ${oneDecimal(measured.psv99Kmh)} km/h · faster than ${percent(measured.psv99Percentile)}% of other A-League ${group}`],
    ["gx-card-sprint", measured.timeToSprintS === null
      ? "Time to sprint: position median (not measured)"
      : `Time to sprint ${oneDecimal(measured.timeToSprintS)} s`],
    ["gx-card-oop", measured.oopHiPerMin === null
      ? "Out of possession: position median (not measured)"
      : `Out of possession ${oneDecimal(measured.oopHiPerMin)} m/min at high intensity · more than ${percent(measured.oopPercentile)}% of other ${group}`],
    measured.offBallRunsPer30 !== null && ["gx-card-runs",
      `${oneDecimal(measured.offBallRunsPer30)} off-ball runs per 30 min in possession (${oneDecimal(measured.runsInBehindPer30)} in behind)`],
    measured.passCompletion !== null && ["gx-card-passing",
      `${percent(measured.passCompletion)}% passes completed · ${oneDecimal(measured.lineBreakingPer30)} line-breaking per 30 min`],
    ["gx-card-national", nationalLine(national)],
    ["gx-card-sources", "SkillCorner (A-League Men 2024/25) · Transfermarkt"],
  ];
  return lines.filter(Boolean).map(([className, text]) => ({ className, text }));
}
