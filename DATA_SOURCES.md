# GhostXI data inventory

Hackathon reference: <https://adriatecharena.com/sports-analytics-hackathon/open-datasets.pdf>.
The integration imports the StatsBomb and Transfermarkt sources linked in that document.
Download configuration and the explicit player-ID crosswalk live in `config/external-sources.json`.

The [behavior MVP](BEHAVIOR_AI.md) additionally imports twelve pre-final Spain/England
Euro 2024 matches for Yamal/Saka profiles. These are separate from the four-match
event catalog below. The final is held out for an event-frequency validation check;
all profile-history dates precede 14 July 2024. Its source hashes appear in `/api/v1/ai/profiles`.

## Active sources and their roles

| Source | Role in GhostXI | Coverage |
| --- | --- | --- |
| Metrica Sample Game 1 | Observed tracking and events for original/ghost comparison | Three eight-second clips, 22 players and ball |
| Friends of Tracking EPV grid | Existing possession-value proxy | 32 x 50 location grid; a model, not player observations |
| StatsBomb Open Data | Actual match events, shots/xG, momentum and per-match player statistics | Four selected international finals |
| Transfermarkt datasets by dcaribou | Public professional-player metadata and dated market estimates | 50,149 profiles and 656,301 valuation source rows in imported version 679 |
| PFF FC via optional Kloppy importer | Validated provider-estimated tracking/metadata/roster parser | Public 200-frame 10517 test excerpt only; not playable; full requested files missing |

StatsBomb events and Transfermarkt market profiles do not create missing continuous
tracking, sprint speed, reaction time or ball-control measurements. They are not used
to assign fabricated physical traits to named players. The existing Metrica replacement
simulation now accepts verified independent candidate identities through the new
multi-ghost workflow; physical assumptions remain separate. Fictional profiles and
StatsBomb reconstructed replays are retired from active routes. See
[VERIFIED_BACKEND.md](VERIFIED_BACKEND.md) and [PFF_IMPORT.md](PFF_IMPORT.md).

## StatsBomb

- Source: <https://github.com/hudl/open-data> (the original `statsbomb/open-data` URL redirects here).
- Pinned commit: `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`.
- Terms: <https://github.com/hudl/open-data/blob/master/LICENSE.pdf>.
- Credits: identify StatsBomb and show its logo when publishing analysis, as required
  in its README. Media pack: <https://statsbomb.com/media-pack/>.
- A copy of the supplied repository logo and public-data agreement is retained under
  `src/data/statsbomb/`. The API serves the logo at `/api/v1/datasets/statsbomb/logo`.

| Match ID | Final | Date | Recorded score before shootout |
| --- | --- | --- | --- |
| 3869685 | Argentina vs France, World Cup | 2022-12-18 | 3-3 |
| 3943043 | Spain vs England, Euro | 2024-07-14 | 2-1 |
| 3906390 | Spain vs England, Women's World Cup | 2023-08-20 | 1-0 |
| 4020846 | England vs Spain, Women's Euro | 2025-07-27 | 1-1 |

For each match the importer downloads the competition-season metadata, event JSON
and lineup JSON. It does not clone the repository or download 360 data.
The current import has 16,122 events across the four matches.

Events retain source UUID, player/team IDs, period, clock, possession and available
locations. Passes, carries, shots, pressures, recoveries, substitutions and cards are
available through a paginated API. Missing locations remain null. The coordinate
conversion scales StatsBomb's 120 x 80 system to 105 x 68 metres; these are actor-relative
event locations, not player trajectories aligned to the Metrica pitch.

The continuous event timeline concatenates the actual durations of periods, preserving
stoppage and extra time. It keeps period and source clock so halftime clock resets
cannot mix events. Shootout events remain labeled and queryable but are excluded from
match goals, player performance statistics and xG momentum.

Momentum uses trailing five one-minute shot-xG bins within each period, Home minus
Away, normalized by peak absolute difference. Cumulative xG is also returned. Top-ten
moments rank shots by xG with bonuses for goals/red cards: an explicit selection heuristic.
Unknown shot xG is counted as missing and remains visible in coverage metadata.

Player statistics count completed/attempted passes, key passes, assists, carries,
pressures, recoveries, interception attempts, shots, goals and xG. The progressive-pass
proxy is a completed pass gaining at least 10 metres toward the opponent goal.
Per-90 values use the union of recorded lineup-position intervals, including stoppage
time, without double counting tactical changes. Absent/invalid minutes produce null
per-90 values. These are single-match samples, not validated overall talent ratings.

## Transfermarkt

- Author's repository: <https://github.com/dcaribou/transfermarkt-datasets>.
- PDF's primary ZIP: <https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip>.
- Official author mirror: <https://www.kaggle.com/datasets/davidcariboo/player-scores>, version **679**.
- Tables imported: `players.csv` and `player_valuations.csv` only.
- License: CC0-1.0, as published by the dataset author.
- Repository documentation reviewed at `e44f186d6f06dd8452aaf54c7921ba66c961f637`.

The primary R2 download returned HTTP 403/error 1010 during setup. The importer uses
the same author's official versioned Kaggle file-download API, which was tested to
work without credentials. This is not scraping Transfermarkt or using an unofficial
live player API. Actual download URLs and SHA-256 hashes appear in `/api/v1/datasets`.

The publisher declares coverage through **6 July 2026** and paused updates. The latest
valuation date actually present in our imported table is **12 June 2026**. Do not label
these values live/current. Club and position fields describe the source snapshot and
must not be presented as the player's club/role on a historical match date.

Each valuation retains its date and EUR amount. `asOf=YYYY-MM-DD` selects only records
on or before that date and returns the chosen valuation date. Missing history remains
null; zero is preserved; conflicting amounts at the latest eligible date are flagged.
The player's age is calculated from birth date at the reference date. Market value is
an estimate, not a transfer fee, quality score or promise of future performance.

## Identity crosswalk

| StatsBomb ID | Transfermarkt ID | Player |
| --- | --- | --- |
| 5503 | 28003 | Lionel Messi |
| 3009 | 342229 | Kylian Mbappé |
| 22084 | 433177 | Bukayo Saka |
| 30714 | 581678 | Jude Bellingham |
| 39461 | 568177 | Cole Palmer |
| 316046 | 937958 | Lamine Yamal |

These six links are explicitly curated, not inferred at runtime by name. The importer
and server check their expected StatsBomb full names/countries and Transfermarkt
names/countries/birth dates. A mismatch or duplicate mapping fails validation.
Linked player responses retain both provider IDs and `marketLink.status: "curated"`.
The Transfermarkt profile includes its canonical source URL.

All other StatsBomb players have `marketLink.status: "unlinked"`, including the women's
matches. No fuzzy join, guessed identity, or link to anonymous Metrica players is made.
Adding a link requires checking both source records and extending the explicit config.
For linked match statistics, prices and ages are always evaluated at that match's date.

## Reproduce the import

```sh
npm run prepare:data
npm run prepare:external
npm test
npm run start:api
```

Python 3's standard library performs the external import; Node runs the API. Raw files
are cached under gitignored `work/datasets/`, with source-URL markers. The prepared
external JSON is also gitignored. The importer writes the combined JSON atomically
and records the preparation timestamp plus every downloaded file's URL, bytes and
SHA-256. Change a source version deliberately in config and reprepare/restart.

Optional command arguments:

```sh
python scripts/prepare-external.py --cache-dir /path/to/cache
python scripts/prepare-external.py --refresh
```

The API performs no external network requests after startup. A missing external cache
keeps Metrica available and returns 503 with preparation instructions for external
routes. Deployments must prepare the local datasets before launching the service.

## Not integrated

Wyscout/SkillCorner source files, Transfermarkt appearances/games/transfers,
full-season StatsBomb scouting, socceraction and a new full-match simulator are
outside this import. Existing PitchKit loader capabilities remain installed.
No ProdReady scan, due diligence or SDLC workflow is activated by preparing datasets.
