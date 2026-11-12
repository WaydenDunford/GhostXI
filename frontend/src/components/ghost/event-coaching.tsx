import { useBackend } from "@/lib/backend-context";
import { buildEventCoachingActions } from "@/lib/event-coaching";
import type { EventPlayer } from "@/lib/backend/ghostxi";
import { DataBadge, PageHeader, Panel } from "./ui";

export function EventCoachingActions({
  players,
  teamName,
}: {
  players: EventPlayer[];
  teamName?: string;
}) {
  const actions = buildEventCoachingActions(players, teamName);
  return (
    <Panel title={`Coaching review${teamName ? ` · ${teamName}` : ""}`}>
      <p className="mb-4 text-sm text-muted-foreground">
        Review and training actions from this match's recorded events. Check the individual
        sequences before deciding on a substitution.
      </p>
      {actions.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {actions.map((action) => (
            <article
              key={action.id}
              className="rounded-lg border border-border bg-background/40 p-4"
            >
              <p className="mb-2 font-mono text-xs uppercase tracking-wider text-primary">
                {action.area}
              </p>
              <h3 className="font-display text-lg font-semibold">{action.title}</h3>
              <p className="mt-3 text-sm">{action.evidence}</p>
              <p className="mt-3 text-sm text-muted-foreground">{action.action}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm">
          Review the recorded passes and shots in Match Lab. A named coaching action needs a
          measured passing sample, a shot with xG, or a recorded recovery for the selected team.
        </p>
      )}
    </Panel>
  );
}

export function EventCoaching() {
  const b = useBackend();
  const match = b.eventMatch.data;
  const players = b.eventPlayers.data;
  if (!match || !players) return <p role="status">Loading match coaching review…</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow={`${match.competition} · ${match.date}`} title="Smart Coach" />
      <Panel
        title={`${match.home.name} ${match.home.score}–${match.away.score} ${match.away.name}`}
      >
        <div className="mb-3">
          <DataBadge kind="observed" />
        </div>
        <p className="text-sm">
          Start with these named, measured review priorities for{" "}
          {b.teamName || "the selected match"}. They identify sequences to review and moves to
          rehearse from the recorded match.
        </p>
      </Panel>
      <EventCoachingActions players={players} teamName={b.teamName} />
    </div>
  );
}
