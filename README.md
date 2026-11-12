# GhostXI

GhostXI uses genuine football tracking to explore explicitly modeled alternatives.
The active replay catalog contains Metrica Sample Game 1's three eight-second clips,
with 22 anonymous source players and the ball. Named replacement identities come
from verified source profiles and remain independent counterfactual candidates.

## Run locally

Requires Node.js 20+ and Python 3 for one-time data imports:

```sh
npm ci
npm run prepare:data
npm run prepare:external
npm run prepare:ai
npm run start:api
```

Open http://127.0.0.1:8787/. Existing prepared data can be used immediately. The API
serves the local replay interface; the old Python-only static startup is superseded.
Choose a source player and moment, add one or more replacements, then save/simulate.
Compare the historical original, individual ghosts and an independent combined run.
Playback, pause, seeking, speed and saved reruns use synchronized source timestamps.

```sh
npm test
npm run build
```

The public build contains eight frontend assets and no source datasets. The backend
must still be hosted separately for Lovable. Configure the exact frontend origin in
CORS_ORIGINS. No deployment, scan, watcher or automatic refactor is enabled.

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
longer active. SkillCorner/Wyscout loader capability exists in PitchKit, but source
files have not been imported. No unsupported Bosnia example is in the active catalog.

Unknown physical attributes remain null. Simulated speed/reaction/spacing defaults
are separate model parameters. These geometric experiments do not predict match
outcomes, possession or transfer success. Metrica match date/score/real player names
remain unknown. Historical originals retain genuine source coordinates and gaps.

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
