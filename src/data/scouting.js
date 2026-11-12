// Merges the real A-League scouting candidates (src/data/scouting-candidates.json) into the
// tracked Metrica match: each moment gets its shortlist, and each candidate becomes a player
// whose `settings` drive the simulation and whose `scouting` record feeds the scouting card.
export function attachCandidates(recording, scouting) {
  const known = new Set(scouting.candidates.map(({ id }) => id));
  const moments = recording.moments.map((moment) => {
    const shortlist = scouting.shortlists[moment.id];
    if (!shortlist) throw new Error(`No scouting shortlist for moment '${moment.id}'.`);
    const unknown = shortlist.find((id) => !known.has(id));
    if (unknown) throw new Error(`Unknown scouting candidate '${unknown}'.`);
    return { ...moment, candidatePlayerIds: [...shortlist] };
  });
  const candidates = scouting.candidates.map((candidate) => ({
    id: candidate.id,
    displayName: `${candidate.name} (${candidate.club})`,
    team: "HOME",
    role: candidate.positionGroup,
    age: candidate.age,
    settings: { ...candidate.settings },
    scouting: structuredClone(candidate),
  }));
  return { ...recording, players: [...recording.players, ...candidates], moments };
}
