# GhostXI current API reference

The active contract is the **verified-data-only** `/api` workflow documented in
[VERIFIED_BACKEND.md](VERIFIED_BACKEND.md). Start with `npm run start:api` and open
`http://127.0.0.1:8787/` for the local UI. See [SUBSTITUTIONS.md](SUBSTITUTIONS.md)
for a working SDK example and [PFF_IMPORT.md](PFF_IMPORT.md) for the optional importer.
The standalone client/type declarations are `src/client/ghostxi.js` and `.d.ts`.

## Replay and scenario routes

| Route | SDK |
| --- | --- |
| GET `/api/datasets/status` | `getDatasetStatus()` |
| GET `/api/matches` | `getReplayMatches()` |
| GET `/api/matches/:id` | `getReplayMatch(id)` |
| GET `/api/matches/:id/lineup` | `getLineup(id)` |
| GET `/api/matches/:id/tracking` | `getReplayTracking(id, query)` |
| GET `/api/matches/:id/moments?playerId=ID&limit=5` | `getRecommendedMoments(id, query)` |
| GET `/api/candidates?matchId=ID&replacePlayerId=ID` | `getReplacementCandidates(query)` |
| GET/POST `/api/scenarios` | `listSavedScenarios(query)` / `createSavedScenario(input)` |
| GET/PATCH/DELETE `/api/scenarios/:id` | `getSavedScenario` / `updateSavedScenario` / `deleteSavedScenario` |
| PUT `/api/scenarios/:id` | Complete field update in the existing scenario shape |
| POST `/api/scenarios/:id/duplicate` | `duplicateSavedScenario(id)` |
| POST `/api/scenarios/:id/simulate` | `simulateSavedScenario(id)` |
| GET `/api/scenarios/:id/findings` | `getSavedScenarioFindings(id)` |
| GET `/api/scouting?candidateId=ID&matchId=ID` | `getCandidateAssessment(query)` |
| GET `/api/recommendation/config` | `getRecommendationConfig()` |

Results use `{data: ...}`; the client unwraps it. Errors use
`{error:{code,message}}` with HTTP 400/404/405/410/413/415/500 as appropriate.
JSON writes require Content-Type application/json and have a 16 KiB limit.
Unknown/repeated query parameters are rejected. `seed` is uint32. Scenario requests
must contain exactly the single- or multi-replacement fields in the shared types.

Tracking query: `momentId`, `period` (1–4), `fromSec`, `toSec`, `offset`, `limit`
(1–2,000). Bounds refer to **within-period source time**. IDs and video time remain
separate. Coordinates are normalized 0–100, null observations/gaps are preserved.
Do not combine successive period clocks into a guessed match/video clock.

Only real, validated local tracking matches are playable. Unsupported Bosnia,
event-only/reconstructed StatsBomb and insufficient PFF excerpts return 404 for
replay/scenario operations. Missing source/model data is not replaced by a mock.

## Preserved source APIs and migration

`/api/v1/statsbomb/matches` and its `/:id`, `/:id/events`, `/:id/players`,
`/:id/momentum` source routes remain available. The SDK methods are
`getEventMatches`, `getEventMatch`, `getEvents`, `getEventPlayers`, `getEventMomentum`.
Transfermarkt `/api/v1/transfermarkt/players` and `/:id` remain available through
`getMarketPlayers` / `getMarketPlayer`. Source status/attribution stays at
`/api/v1/datasets`; the StatsBomb logo is `/api/v1/datasets/statsbomb/logo`.
The separate `/api/v1/ai` behavior experiment remains documented in BEHAVIOR_AI.md;
it is not an observed named-player match replay.

Legacy `/api/v1/matches` original metadata/windows and momentum remain, with metre
coordinates on those legacy frame contracts. Fictional candidate defaults are
removed. `/api/v1/comparisons` now returns **410 LEGACY_DEMO_RETIRED**: migrate to
saved `/api/scenarios` and use its normalized multi-branch response. No drop-in
compatibility with the old fictional-profile response is claimed.

## Configuration and checks

HOST defaults to 127.0.0.1, PORT to 8787. CORS_ORIGINS is a comma-separated exact
origin allowlist. Defaults cover localhost/127.0.0.1 on 5173, 3000 and 8787; configure
your actual Lovable HTTPS origin for deployment. CORS is not authentication. Saved
scenario JSON defaults to `work/state/scenarios.json`; override with
GHOSTXI_SCENARIO_STORE on persistent storage. The store supports one process.

No credentials are needed for prepared source playback. A shared hosted frontend
requires a reachable HTTPS backend; each visitor's localhost is their own machine.
This change prepares and tests the implementation locally and does not deploy it.
Run `npm test` and `npm run build`; optional PFF dependencies live in requirements-pff.txt.
