# GhostXI

GhostXI uses genuine football tracking to explore explicitly modeled alternatives.
The active replay catalog contains Metrica Sample Game 1's three eight-second clips,
with 22 anonymous source players and the ball. Named replacement identities come
from verified source profiles and remain independent counterfactual candidates.

## Run locally

The primary interface is the full Lovable frontend in `frontend/`, connected to
the local Node API. Use Node.js 22.12+ and Python 3 for one-time data imports:

```sh
npm ci
npm run install:frontend
npm run prepare:data
npm run prepare:external
npm run prepare:ai
npm run dev
```

Open http://127.0.0.1:5173/match-lab. Existing prepared data can be used immediately.
`npm run dev` starts the Lovable frontend and starts or reuses the local API on
port 8787. API calls use the frontend's same-origin proxy. `npm run start:api`
also runs the backend alone, including its compact reference interface on port 8787.
Choose a source player and moment, add one or more replacements, then save/simulate.
Compare the historical original, individual ghosts and an independent combined run.
Playback, pause, seeking, speed and saved reruns use synchronized source timestamps.

```sh
npm test
npm run check:frontend
npm run test:frontend
npm run build
npm start
```

The build produces the Lovable client and Node SSR application in `frontend/.output/`,
alongside the compact reference UI in `dist/public`. Source datasets are not copied
into either public bundle. `npm start` runs the built Lovable interface and local API.
For separate frontend/API hosting, configure `VITE_GHOSTXI_API_URL` and the exact
frontend origin in `CORS_ORIGINS`. This repository does not deploy or enable a scan.

## Data and API

The imported Lovable frontend is in `frontend/`; `npm run dev` starts it with the
local API at http://127.0.0.1:5173/match-lab. Use `npm run install:frontend` if its
dependencies are missing. Separate frontend checks are `npm run check:frontend`,
`npm run test:frontend`, and `npm run build:frontend`.

- [Verified backend technical report](VERIFIED_BACKEND.md): current registry, endpoints,
  contracts, scoring, acceptance verification and remaining limitations.
- [PFF importer and official access](PFF_IMPORT.md): optional Kloppy loader, manifest,
  roster/time/coordinate checks and missing full World Cup files.
- [API reference](API.md) and [substitution client flow](SUBSTITUTIONS.md).
- [Source inventory](DATA_SOURCES.md) and separate [behavior experiment](BEHAVIOR_AI.md).

PFF full requested-access data is not available. The actual public Kloppy excerpt
of Argentina-France 10517 successfully parses but lacks a continuous eligible replay
window; it is not a playable World Cup match. StatsBomb's four finals remain available
for real event analytics/profile evidence. Their former reconstructed replays are no
longer active. SkillCorner named replay windows are available through the importer below; Wyscout files are not imported.
The separate SkillCorner A-League aggregate workflow is described below. No
unsupported Bosnia example is in the active catalog.

Unknown physical attributes remain null. Simulated speed/reaction/spacing defaults
are separate model parameters. These geometric experiments do not predict match
outcomes, possession or transfer success. Metrica match date/score/real player names
remain unknown. Historical originals retain genuine source coordinates and gaps.

## A-League measured candidate workflow

The merged scouting workflow preserves the twelve real A-League Men 2024/25
candidates, four per source clip, in `src/data/scouting-candidates.json`.
`npm run report:candidates` compares their individual modeled runs on the recorded
Metrica clips. `npm run prepare:scouting` rebuilds the candidate file from SkillCorner
season aggregates and Transfermarkt; those upstream files are not revision-pinned,
so rebuilding can change the shortlist. The original scouting card and its source
license are retained with this workflow.

SkillCorner supplies measured top speed, time-to-sprint and out-of-possession
running aggregates. Acceleration, reaction delay and engagement range are modeled
mappings, not direct measurements. These source-informed individual runs coexist
with the verified multi-ghost API's explicitly shared physical defaults. The active
Lovable talent pool uses the verified StatsBomb/Transfermarkt identity workflow;
the A-League report does not claim those players were in the anonymous source match.

## Reuse decisions


| Component | License and dependencies | Use in this slice |
| --- | --- | --- |
| [PitchKit](https://www.pitchkitjs.com/docs/data) | MIT. `@pitchkit/data-providers` 0.6.0 depends on `csv-parse`. `@pitchkit/react` 0.9.0 uses `@pitchkit/core` and requires React and React DOM 18+. | **Integrated with an adapter.** `fetchEvents`, `fetchTrackingWindow` and `attackingDirection` load Metrica data. The adapter joins the recorded window to its events and converts normalized coordinates to metres. Existing Canvas handles playback and the ghost overlay. |
| [Metrica Sports Sample Data](https://github.com/metrica-sports/sample-data#legal-stuff) | Publisher provides anonymized samples for analysis and requests public attribution. The repository has no explicit data license file. | **Integrated.** Fetches Game 1 locally from pinned revision `e706dd506b360d69d9d123d5b8026e7294b13996`. GhostXI credits Metrica Sports in the dashboard. |
| [StatsBomb Open Data](https://github.com/hudl/open-data) | StatsBomb public-data terms; credit StatsBomb and show its supplied logo when publishing analysis. | **Integrated.** Four selected finals, actual events and xG, lineup-derived minutes, per-90 statistics and event momentum. Event locations are not continuous tracking. |
| [Transfermarkt datasets](https://github.com/dcaribou/transfermarkt-datasets) | Dataset published under CC0-1.0. Author's versioned Kaggle mirror is used for two CSV tables. | **Integrated.** Player directory, birth dates, positions and historical market values; six curated StatsBomb ID links. No guessed identities or physical attributes. |
| [Friends of Tracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking) | MIT. Full Python EPV and pitch-control code uses NumPy and the Metrica pandas pipeline. | **Integrated.** Reuses the 32×50 `EPV_grid.csv` at revision `7ed3ff857940d3f4611be55f3c08c79525c32171` with its license notice. The browser lookup maps Metrica coordinates to grid rows and mirrors columns by attacking direction. |
| [socceraction](https://socceraction.readthedocs.io/en/latest/documentation/valuing_actions/xT.html) | MIT. The inspected source targets Python 3.9–3.12 and uses pandas, NumPy, scikit-learn and pandera. | **Deferred.** `ExpectedThreat.fit` and `rate` work with SPADL event actions. Applying it here would require event conversion and a trained or pre-trained model. The FoT grid already provides a location value for this demo. |
| [Football Simulator](https://github.com/tbleckert/football-simulator) | MIT. `@bleckert/football-simulator` declares Node 18+ and an `events` runtime dependency. | **Deferred.** The inspected `RealTimeEngine` constructs state from two `Team` objects, starts at kickoff and exports snapshots via `simulate`/`tick`. It accepts an injected random function. No public API in the inspected implementation initializes it from an external tracking snapshot with ball ownership, velocities and intents. |


Kloppy is an optional BSD-3-Clause importer dependency. PFF data usage permission is separate.

### Named matches and team selection

The Lovable frontend defaults to named tracking replays. The **Real match events** source offers the four configured international finals at the pinned StatsBomb revision in `config/external-sources.json`. Its initial team comes from the newest available fixture. Changing match updates the score, date, venue, source roster, match-event viewer, xG momentum, player statistics and JSON report together. The discontinued Arsenal 2003/04 dataset is excluded from imports and from the active API even if an older local cache still contains it.

StatsBomb supplies recorded actor locations, pass/carry/shot endpoints, lineups and shot xG. The pitch steps through source events in actor-relative attacking coordinates; it does not infer other players’ locations or interpolate trajectories. Momentum uses trailing five one-minute xG bins, with period boundaries retained. Full-time score and match date remain visible. The report exports the selected match's normalized source data and calculation method.

Choose **Tracking replays** in the same selector for synchronized recorded movement and modeled ghost comparisons. Metrica Sample Game 1 is anonymous; its Home/Away identities cannot be mapped to named players. Event-only matches are never passed into the tracking simulation. Raw downloaded data remains in ignored local caches; a fresh checkout needs `npm run prepare:external` before these matches are available.

### Named tracking from May 2025

Run `npm run prepare:tracking` to download the three pinned SkillCorner A-League Men matches in `config/skillcorner-sources.json` (17, 9 and 3 May 2025). Full tracking source files are kept under ignored `work/datasets/skillcorner/` and verified against their Git LFS SHA256 and byte length. The importer prepares five non-overlapping eight-second clips per match with a stable 11v11 lineup and available ball coordinates. It excludes wholly extrapolated windows and requires at least five detected players on average plus detected ball evidence. It does not invent, interpolate or clamp missing positions. Restart the API after preparation.

The Lovable frontend opens **Tracking replays**, defaults to the newest available named match and supports team/match filters. It shows the source final score, historical date, stadium, actual player names and shirt numbers. Solid player outlines indicate detected coordinates; dashed outlines indicate provider extrapolation. Frame-level counts and ball provenance remain visible. Gaps and unimported intervals are unavailable. This is a historical 2024/25 sample, not a live 2026 feed.

Original/ghost/overlay replay, source-aligned action cues, bench replacements and saved scenarios use the same verified backend. Candidate eligibility is evaluated against the selected clip's actual lineup. Ghost branches use shared explicit physical assumptions, not measured personalized abilities; all other source paths stay unchanged. The separate source momentum chart uses SkillCorner's model-derived possession EPV, signed by team and normalized by peak magnitude, with elapsed playing time including stoppage. It is not shot xG or a result prediction.

Source and MIT license: https://github.com/SkillCorner/opendata. Normalized clip bundles, raw tracking and source license copies are kept in ignored `src/data/skillcorner/replays/`; a fresh checkout must run the importer. The configured StatsBomb event matches and the anonymous Metrica source remain selectable.
