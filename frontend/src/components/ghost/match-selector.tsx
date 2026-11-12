import { useBackend } from "@/lib/backend-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MatchSelector() {
  const b = useBackend();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-card/70 px-4 py-3 md:px-6">
      <div className="w-44">
        <label className="text-eyebrow" htmlFor="data-source">
          Data source
        </label>
        <Select
          value={b.sourceMode}
          onValueChange={(v) => b.setSourceMode(v as "events" | "tracking")}
        >
          <SelectTrigger id="data-source" aria-label="Select data source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="events">Real match events</SelectItem>
            <SelectItem value="tracking">Metrica tracking</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {b.sourceMode === "events" ? (
        <>
          <div className="w-48">
            <label className="text-eyebrow" htmlFor="match-team">
              Team
            </label>
            <Select value={b.teamName} onValueChange={b.setTeamName}>
              <SelectTrigger id="match-team" aria-label="Select team">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {b.teams.map((t) => (
                  <SelectItem value={t} key={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 flex-1 basis-72">
            <label className="text-eyebrow" htmlFor="source-match">
              Match · {b.teamMatches.length} imported
            </label>
            <Select value={b.eventId} onValueChange={b.setEventId}>
              <SelectTrigger id="source-match" aria-label="Select match" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {b.teamMatches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.date} · {m.home.name} {m.home.score}–{m.away.score} {m.away.name} ·{" "}
                    {m.season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1 basis-72">
          <label className="text-eyebrow" htmlFor="tracking-match">
            Anonymous source recording
          </label>
          <Select
            value={b.matchId}
            onValueChange={(id) => {
              b.setMatchId(id);
              b.setSelection(null);
            }}
          >
            <SelectTrigger id="tracking-match" aria-label="Select tracking match">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {b.matches.map((m) => (
                <SelectItem value={m.id} key={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {b.sourceMode === "events" && b.eventMatch.data && (
        <p className="basis-full text-xs text-muted-foreground">
          {b.eventMatch.data.competition} · {b.eventMatch.data.season} · {b.eventMatch.data.date} ·
          StatsBomb Open Data · recorded events and lineups; continuous tracking unavailable.
        </p>
      )}
    </div>
  );
}
