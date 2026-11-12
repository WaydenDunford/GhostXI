# GhostXI verified-data backend — technical report

## Audit and implementation

A Lovable React/TanStack `frontend/` appeared during this work. Its existing
backend connection uses the verified catalog and shared SDK. Its football routes
gate on the real backend; no fallback Bosnia replay is active. Its separate
non-football demo fixtures are not claimed to be verified football history.
The frontend design was preserved; this report distinguishes it from the small
reference replay served directly by the Node API.

The existing stack is Node.js ES modules with a standard-library HTTP service,
PitchKit data loaders, Metrica prepared tracking, StatsBomb event normalization,
Transfermarkt profile enrichment and a FoT EPV grid. Existing momentum/analytics,
scenario JSON persistence, source-ID crosswalks, client and canvas renderer were
reused. The multi-ghost kernel shares the bounded steering step with the original
movement engine. No neural training, scan, continuous process or deployment was added.

The audit found three genuine Metrica tracking clips and four event-only StatsBomb
finals. Earlier substitution routes reconstructed StatsBomb movement from formations;
that reconstruction is no longer exposed as an active replay/scenario. The former
hardcoded Lane reader/Patient cover/Wide runner identities are not active candidate
records. Historical numerical model unit tests remain as internal fixtures.

No Bosnia/Demirović/Tabaković/Jovo Lukić/Matej Deket scenario existed in this
checkout before the update. An eligibility gate and regression now exclude such
named scenarios without the additional verified identity/characteristic evidence.
The same replay gate applies to current and legacy replay metadata routes. Old
unsupported saved scenarios are retained on disk but hidden and rejected on rerun.

## Dataset and match status

| Provider | Imported observations | Active replay |
| --- | --- | --- |
| Metrica | Sample Game 1; 603 genuine player/ball frames in three eight-second 25 Hz windows; 823 same-match pass/shot events | Yes, those windows only |
| PFF FC | Official Kloppy public parser excerpt of final 10517; 200 discontinuous broadcast frames, roster and metadata | No: insufficient continuous coverage and no delivered synchronized event file |
| StatsBomb | Four finals: 3869685, 3943043, 3906390, 4020846; actual events/lineups | No tracking replay; original event analytics remain available |
| Transfermarkt | 50,149 profiles; 656,301 dated valuations; six curated StatsBomb ID links | Profile enrichment, independently verified counterfactual identity data |
| SkillCorner | Three named A-League Men matches from May 2025; five stable 11v11 eight-second 10 Hz source windows each; per-player detection/extrapolation flags retained | Yes, imported windows only |
| Wyscout | Existing installed PitchKit loader capability; no source files imported | No |

Wyscout remains unimported. SkillCorner now uses the pinned `npm run prepare:tracking` workflow described in README.md. The installed Wyscout
loader capability is preserved and the registry truthfully reports its missing files.
PFF requested-access files are still needed; see [PFF_IMPORT.md](PFF_IMPORT.md).
The public test excerpt verifies parsing, not availability of a full World Cup replay.

Metrica teams/players are anonymous. The source supplies no verified match date,
historical named identities or score; these remain unknown. Named candidates are
verified independently through source IDs and explicit crosswalks, never a name
join or assertion that they appeared in the Metrica match. Available physical traits
remain null. Counterfactual movement parameters live in separate model evidence.

## Run, build and API

With the datasets already prepared:

```sh
npm run start:api
```

Open `http://127.0.0.1:8787/`. The API serves a small explicit UI-asset whitelist,
not the repository filesystem. Its original and simulated canvases share source
timing, with play/pause, seek, speed .5/1/2/4×, player selection, multiple replacements,
branch selection, saved reruns, coverage labels, coaching and scouting summaries.
The source and simulation coordinate contracts remain separate. The renderer never
fills missing source positions. Available source substitution markers are returned;
complete synchronized historical substitution records are not imported in this demo.

```sh
npm test
npm run build
```

The build validates JavaScript syntax and copies eight public frontend assets to
`dist/public`. It does not copy datasets or deploy a backend. A separately hosted
frontend must use the Node API and configure its exact origin in `CORS_ORIGINS`.
The SDK's `baseUrl` retains `/api/v1`; new methods derive the `/api` base.

The imported Lovable frontend can be started with `npm run dev` (5173/match-lab),
after `npm run install:frontend` if needed. Its own checks are
`npm run check:frontend`, `npm run test:frontend`, `npm run build:frontend`.

| Route | Behavior |
| --- | --- |
| GET `/api/datasets/status` | Accessibility, roster/event/tracking availability, validation, limitations |
| GET `/api/matches` | Only validated, locally available tracking matches |
| GET `/api/matches/:id` | Verified metadata, roster, coverage, available substitution records |
| GET `/api/matches/:id/lineup` | Source player/team IDs and known starting status |
| GET `/api/matches/:id/tracking` | Original normalized source frames; explicit gaps/nulls |
| GET `/api/matches/:id/moments` | Same-match event/tracking recommendations; optional playerId |
| GET `/api/candidates?matchId=&replacePlayerId=` | Verified bench/scouting identity profiles; null unknown traits |
| GET/POST `/api/scenarios` | List eligible saved scenarios / create |
| GET/PATCH/PUT/DELETE `/api/scenarios/:id` | Read/edit/delete |
| POST `/api/scenarios/:id/duplicate` | Copy under a new ID |
| POST `/api/scenarios/:id/simulate` | Individual and independent combined branches |
| GET `/api/scenarios/:id/findings` | Calculated findings with recorded/model/hypothesis evidence |
| GET `/api/scouting?candidateId=&matchId=` | Deduplicated role/team/match-specific review proxy |

Responses retain `{data: ...}` / `{error:{code,message}}`. Tracking accepts `momentId`,
`period`, `fromSec`, `toSec`, `offset`, `limit` (maximum 2,000). Bounds are source
**within-period seconds**. Source frame ID and video time are separate fields.
Frame coordinates are 0–100 top left; missing ball/player values are null.
Tracking is paginated without interpolation. Only stable full-lineup eight-second
windows qualify for simulation; partial tracking can remain visible with quality
information without becoming an eligible scenario.

StatsBomb `/api/v1/statsbomb/*`, Transfermarkt `/api/v1/transfermarkt/*`, source
status, behavior-profile evidence and original numerical methods remain available.
The old fictional-profile `/api/v1/comparisons` route returns 410 with migration
instructions. Legacy replay metadata strips fictional candidate defaults; legacy
candidate/scouting routes resolve to the verified profile workflow. It is a deliberate
policy change, not a claim of complete backwards compatibility.

## Single and multi-ghost contracts

The existing six mutable single-replacement fields remain accepted. A multi scenario
uses this alternative contract, with backend-generated `id`:

```json
{
  "sportId": "football",
  "matchId": "metrica-game-1",
  "momentId": "home-wide-interception",
  "seed": 42,
  "replacements": [
    {"originalPlayerId": "Player2", "candidatePlayerId": "statsbomb:30714"},
    {"originalPlayerId": "Player3", "candidatePlayerId": "statsbomb:3009"}
  ]
}
```

One to four replacements from the same historical team are accepted. Original IDs
and candidate IDs must be distinct; candidates cannot already be active. Team size
stays 22, and the source frames remain immutable. Two replacements produce the
historical original, `individual:1`, `individual:2` and `combined`. Every alternative
starts at the same original source positions. Combined integration maintains its own
joint state with mutual ghost-separation forces; it does not add individual outcomes.

The response preserves `originalFrames`, `alternativeFrames`, scalar `metrics`,
`explanations`, `limitations`, `dataCoverage`, and adds `branches`, `findings`,
`originalDataStatus`, `originalLineup`, and structured `evidence`. For multiple
replacements `alternativeFrames` aliases the combined result. Definitions are in
`src/client/ghostxi.d.ts`; recorded fixtures accompany the integration package.

## Evidence, scoring and remaining limits

Recommendations reuse provisional .30 momentum/.25 position/.20 involvement/.15
opportunity/.10 coverage weights and overlap suppression. Metrica momentum uses
its actual source pass/shot EPV timeline. There are only three qualified windows,
so three are returned instead of inventing ten. Up to five player-specific windows
are supported where source coverage permits. PFF semantic event ranking awaits an
actual inspected delivered event schema; it currently returns no invented timeline.

Named profiles expose source position/team/date, verified DOB where present, available
historical action counts and missing attributes. Metrica's unknown date means age
at that historical match stays null; later profile statistics are descriptive reference
evidence and are not claimed to be pre-match observations. Natural anonymous player
roles, team-style fit and calibrated historical contribution stay unknown.

Shared modeled defaults are max speed 5.4 m/s, acceleration 4 m/s², reaction .25 s,
ball reaction radius 4 m, separation radius 4 m and separation strength 2. These are
engineering assumptions, not measured candidate characteristics. The ball and other
players retain their source paths. The simulator does not calculate new passing
chains, possession, goal probabilities, football rules or historical match outcomes.
This deterministic kernel records a seed but has no stochastic component.

Coach findings use calculated mean ball distance, geometric access fraction, EPV
access proxy and combined minimum ghost separation. Each includes supporting values,
limitations and a follow-up investigation. Recorded facts, model estimates and scouting
hypotheses are separate. No LLM invents a statistic or declares a historical error.

Team Fit is an uncalibrated review proxy: known role compatibility 30%, simulated
contribution 50%, evidence coverage 20%, with missing role excluded/renormalized.
Unknown historical contribution/style remain null. Results are grouped by match,
team and role, duplicates count once, scores are capped at 69 and confidence is low.
Categories are review labels, not transfer success probabilities or measured ability.

## Verification and attribution

Local result: **35 tests passed, 0 failed, 0 skipped**. `npm run build` passed.
The imported React frontend also passed its full TypeScript check, **11 tests
across four files**, and the production Vite/Nitro build.
The standalone SDK declaration file passed TypeScript 5.9.3 with
`--noEmit --strict --lib es2022,dom`. Browser behavior was checked on the Node
reference replay (not the newly imported React frontend) in the
existing dark design and a narrow browser viewport; no light theme was introduced.

The regression suite includes actual PFF/Kloppy excerpt re-parsing, missing-file
failure, roster/team IDs, known coordinate examples, exact source timestamps,
explicit missing values/gaps, no fabricated coordinates, multi-ghost independence,
22-player branches, original immutability, determinism, eligibility/identity errors,
Bosnia exclusion, CRUD/reopen and the real HTTP/client acceptance flow. JavaScript
syntax/build and standalone SDK TypeScript declaration checks are run separately.
Browser checks cover two replacements, independent branches, saved rerun, playback,
pause, seeking, keyboard speed selection and application-styled menus.

See [DATA_SOURCES.md](DATA_SOURCES.md) and README for pinned revisions and source
licenses. Preserve Metrica attribution; use its sample under its published research
terms. Keep StatsBomb credit, logo and source license; retain FoT/PitchKit MIT notices.
Transfermarkt mirror tables use their documented CC0 distribution.
[Kloppy uses BSD-3-Clause](https://github.com/PySport/kloppy/blob/a9651eba7c4dbbe2d2fc6d4cffb4aea63fadac11/LICENSE);
that software license does not grant rights to the PFF requested dataset. PFF raw files and its
test excerpt are not bundled for redistribution. This work activates no ProdReady scan.

The current replay catalog includes the three named SkillCorner 2025 matches after `npm run prepare:tracking`. Source final scores, dates, names and shirts come from the same metadata files; source dynamic-event frame IDs align the clips. Provider-extrapolated coordinates remain ESTIMATED and are rendered with dashed player outlines. Ghost branches remain modeled. The older source audit above describes the initial slice, not the expanded current catalog.
