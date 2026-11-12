# Verified tracking substitutions

The verified-data policy supersedes the earlier reconstructed StatsBomb workflow.
`statsbomb:3943043` (Rodri/Zubimendi) has no imported real tracking and cannot be
created, replayed or rerun through the active scenario API. Event analytics remain
available separately. Old unsupported saved rows are not deleted, but are hidden
and rejected for simulation. Fictional parameter-profile identities are retired
from the active UI/API. Full implementation details are in [VERIFIED_BACKEND.md](VERIFIED_BACKEND.md).

```js
import { createGhostXIClient } from "./ghostxi.js";
const api = createGhostXIClient({baseUrl: "http://127.0.0.1:8787/api/v1"});
const matches = await api.getReplayMatches();
const matchId = matches[0].id; // currently metrica-game-1
const lineup = await api.getLineup(matchId);
const moments = await api.getRecommendedMoments(matchId, {playerId: "Player2", limit: 5});
const candidates = await api.getReplacementCandidates({matchId, replacePlayerId: "Player2"});
const scenario = await api.createSavedScenario({
  sportId: "football", matchId, momentId: "home-wide-interception", seed: 42,
  replacements: [
    {originalPlayerId: "Player2", candidatePlayerId: "statsbomb:30714"},
    {originalPlayerId: "Player3", candidatePlayerId: "statsbomb:3009"},
  ],
});
const result = await api.simulateSavedScenario(scenario.id);
const coaching = await api.getSavedScenarioFindings(scenario.id);
const assessment = await api.getCandidateAssessment({candidateId: "statsbomb:30714", matchId});
```

The original is actual anonymous Metrica tracking. Named profiles describe separate
modeled replacements, not historical Metrica identities. Missing physical attributes
are null; model assumptions are in `result.evidence.modelEstimates`. Multiple
replacements produce individual branches plus an independent joint simulation.
All branches contain 22 players and start from the same source conditions.

SDK contracts are in `src/client/ghostxi.d.ts`. Both the original single-replacement
six-field request and the new `MultiGhostScenario` are supported. Scenario JSON
persistence remains at `work/state/scenarios.json` (or `GHOSTXI_SCENARIO_STORE`).
CRUD, duplicate, rerun and reopening remain supported. Results are recomputed,
not persisted as immutable result snapshots. The store is one-process, shared demo
storage with no private-user account separation.

Use only `getReplayMatches()` for playable matches. `getEventMatches()` is an
event catalog and cannot supply tracking. Tracking coordinates are 0–100 with
null missing observations; time is explicitly within-period source time. There is
no implicit gap interpolation. Metrica currently supplies three qualified moments,
so the response has three rather than inventing five or ten.
