import { useBackend } from "@/lib/backend-context";
import { PageHeader, Panel, DataBadge } from "./ui";
import { Button } from "@/components/ui/button";
import { EventCoachingActions } from "./event-coaching";
import { buildEventCoachingActions } from "@/lib/event-coaching";

export function EventReport() {
  const b = useBackend();
  const m = b.eventMatch.data!;
  const players = b.eventPlayers.data!;
  const xg = b.eventMomentum.data!;
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              match: m,
              players,
              momentum: xg,
              events: b.eventActions.data,
              coachingReview: buildEventCoachingActions(players, b.teamName),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghostxi-${m.providerId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow={`StatsBomb · ${m.providerId}`} title="Match Analysis Report">
        <Button variant="outline" onClick={() => window.print()}>
          Export PDF
        </Button>
        <Button onClick={download}>Export source JSON</Button>
      </PageHeader>
      <Panel title={`${m.competition} · ${m.season} · ${m.date}`}>
        <h2 className="font-display text-3xl font-bold">
          {m.home.name} {m.home.score}–{m.away.score} {m.away.name}
        </h2>
        <p>
          {m.stadium ?? "Venue unavailable"} · Full time · xG {xg.totals.homeXG.toFixed(2)}–
          {xg.totals.awayXG.toFixed(2)}
        </p>
        <DataBadge kind="observed" />
      </Panel>
      <EventCoachingActions players={players} teamName={b.teamName} />
      <Panel title="Recorded player statistics">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Min</th>
                <th>Passes completed</th>
                <th>Shots</th>
                <th>Goals</th>
                <th>xG</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr className="border-t" key={p.id}>
                  <td className="py-2">
                    {p.jerseyNumber ?? "—"} · {p.name}
                  </td>
                  <td>{p.teamName}</td>
                  <td>{p.minutesPlayed?.toFixed(0) ?? "—"}</td>
                  <td>{p.stats["passesCompleted"]}</td>
                  <td>{p.stats["shots"]}</td>
                  <td>{p.stats["goals"]}</td>
                  <td>{p.stats["xg"]?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Source and calculation">
        <p className="text-sm">{m.statsMethod}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {xg.method} Coaching review actions use the named player's recorded actions in this match.
          Event counts describe what happened; review the sequences before changing the lineup.
        </p>
        <img className="mt-3 h-9" src="/api/v1/datasets/statsbomb/logo" alt="Data: StatsBomb" />
      </Panel>
    </div>
  );
}
