import type { EventPlayer } from "./backend/ghostxi";

export interface EventCoachingAction {
  id: string;
  area: "Passing" | "Shot creation" | "Transitions";
  playerId: string;
  playerName: string;
  title: string;
  evidence: string;
  action: string;
}

const measured = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Match-specific review prompts; event totals alone do not judge a replacement. */
export function buildEventCoachingActions(
  players: EventPlayer[],
  teamName?: string,
): EventCoachingAction[] {
  const roster = players.filter((player) => !teamName || player.teamName === teamName);
  const actions: EventCoachingAction[] = [];
  const passers = roster.flatMap((player) => {
    const attempted = player.stats["passesAttempted"];
    const completed = player.stats["passesCompleted"];
    return measured(attempted) && attempted >= 10 && measured(completed) && completed <= attempted
      ? [{ player, attempted, completed, rate: completed / attempted }]
      : [];
  });
  // Prioritize a review of the least successful passing sample, without
  // comparing unlike small samples or treating completion as player quality.
  const passer = passers.sort((a, b) => a.rate - b.rate || b.attempted - a.attempted)[0];
  if (passer) {
    const { player, attempted, completed, rate } = passer;
    const incomplete = attempted - completed;
    actions.push({
      id: `passing:${player.id}`,
      area: "Passing",
      playerId: player.id,
      playerName: player.name,
      title: incomplete
        ? `Review passing support for ${player.name}`
        : `Rehearse ${player.name}'s passing sequences`,
      evidence: `${player.name} completed ${completed} of ${attempted} passes (${(rate * 100).toFixed(1)}%) in this match.`,
      action: incomplete
        ? `Review ${player.name}'s ${incomplete} incomplete ${incomplete === 1 ? "pass" : "passes"}. Check the intended receiving options and rehearse a short supporting outlet before considering a personnel change.`
        : `Replay ${player.name}'s completed-pass sequences and rehearse the observed receiving and return-pass options with the same unit.`,
    });
  }
  const shooter = roster
    .flatMap((player) => {
      const shots = player.stats["shots"];
      const xg = player.stats["xg"];
      return measured(shots) && shots > 0 && measured(xg) ? [{ player, shots, xg }] : [];
    })
    .sort((a, b) => b.shots - a.shots || b.xg - a.xg)[0];
  if (shooter) {
    const { player, shots, xg } = shooter;
    const average = xg / shots;
    actions.push({
      id: `shooting:${player.id}`,
      area: "Shot creation",
      playerId: player.id,
      playerName: player.name,
      title: `Review the chances reaching ${player.name}`,
      evidence: `${player.name} took ${shots} ${shots === 1 ? "shot" : "shots"}, worth ${xg.toFixed(2)} xG in total (${average.toFixed(2)} xG per shot) in this match.`,
      action:
        average < 0.1
          ? `Review the build-up to ${player.name}'s attempts. Test whether an extra pass or a different receiving position offers a better shooting opportunity before rehearsing the move.`
          : `Replay the build-up to ${player.name}'s shots and rehearse the recorded passing combinations into those shooting positions. Check each attempt before changing the attacking role.`,
    });
  }
  const recovery = roster
    .flatMap((player) => {
      const count = player.stats["recoveries"];
      return measured(count) && count > 0 ? [{ player, count }] : [];
    })
    .sort((a, b) => b.count - a.count)[0];
  if (recovery) {
    const { player, count } = recovery;
    actions.push({
      id: `recoveries:${player.id}`,
      area: "Transitions",
      playerId: player.id,
      playerName: player.name,
      title: `Prepare the next pass after ${player.name}'s recoveries`,
      evidence: `${player.name} recorded ${count} ball ${count === 1 ? "recovery" : "recoveries"} in this match.`,
      action: `Review the first action after ${player.name}'s recoveries. Rehearse two nearby passing outlets so the unit has clear options when the ball is regained.`,
    });
  }
  return actions;
}
