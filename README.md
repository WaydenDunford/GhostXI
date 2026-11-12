# GhostXI

GhostXI compares recorded football scenarios with modeled player replacements. All three eight-second clips come from Metrica Sample Game 1. The original 22 players and ball remain visible while the modeled replacement appears as a translucent ghost.

| Scenario | Match clock | Recorded player under review | Real candidates (A-League Men 2024/25) |
| --- | --- | --- | --- |
| Transition | 00:10.04–00:18.04 | Home 2 intercepts an infield pass at 00:15.12. | Centre-backs: Daniel Hall, Alexandar Popovic, Isaac Hughes, Brendan Hamill |
| Press | 03:41.20–03:49.20 | Home 1 wins the tackle at 03:45.08. | Full-backs: Dylan Pierias, Rhyan Grant, Tim Payne, Daniel Wilmering |
| Attack | 06:17.28–06:25.28 | Home 8 receives a deep pass and shoots at 06:25.12. | Wide attackers: Marin Jakoliš, Logan Rogerson, Riku Danzaki, Liam Gillion |

Each clip offers four players from the replaced player's position. They are the fastest, the hardest worker without the ball, the quickest to sprint speed, and a "hidden talent" with strong numbers and a below-median 2024/25 market value. Their numbers are measured by SkillCorner; their runs in these clips are modeled. The recorded players are anonymized by Metrica.

## Run the demo

From the GhostXI repository, using Node.js 20+ and Python 3:

```sh
npm ci
npm run prepare:data
python -m http.server 8764 --bind 127.0.0.1
```

Open [GhostXI locally](http://127.0.0.1:8764/). Select a match situation and replacement candidate, click **Compare players**, then click **Play** or scrub through the clip. The dotted player is the modeled replacement and the cross marks the assigned tactical point. **Hide comparison** restores the original view. Run `npm test` after preparing the data to verify reproducibility, baseline preservation and the analytics.

The preparation step downloads the event file and three tracking windows from a pinned Metrica revision. Run `npm run prepare:data` again if you have the earlier one-clip cache. The prepared JSON stays in the local checkout. Playback makes local requests for the prepared JSON and the vendored EPV grid.

The replacement candidates are real A-League Men 2024/25 players, four per scenario, committed in `src/data/scouting-candidates.json`. Each one's measured top speed, time to sprint and out-of-possession running set how his modeled replacement moves. `npm run prepare:scouting` rebuilds the file from SkillCorner and Transfermarkt (about 12 MB). Their files are not pinned to a revision, so a rebuild can change the picks; don't run it right before a demo. `node scripts/report-candidates.js` prints how each candidate's run differs in each clip.

## Reuse decisions

| Component | License and dependencies | Use in this slice |
| --- | --- | --- |
| [PitchKit](https://www.pitchkitjs.com/docs/data) | MIT. `@pitchkit/data-providers` 0.6.0 depends on `csv-parse`. `@pitchkit/react` 0.9.0 uses `@pitchkit/core` and requires React and React DOM 18+. | **Integrated with an adapter.** `fetchEvents`, `fetchTrackingWindow` and `attackingDirection` load Metrica data. The adapter joins the recorded window to its events and converts normalized coordinates to metres. Existing Canvas handles playback and the ghost overlay. |
| [Metrica Sports Sample Data](https://github.com/metrica-sports/sample-data#legal-stuff) | Publisher provides anonymized samples for analysis and requests public attribution. The repository has no explicit data license file. | **Integrated.** Fetches Game 1 locally from pinned revision `e706dd506b360d69d9d123d5b8026e7294b13996`. GhostXI credits Metrica Sports in the dashboard. |
| [Friends of Tracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking) | MIT. Full Python EPV and pitch-control code uses NumPy and the Metrica pandas pipeline. | **Integrated.** Reuses the 32×50 `EPV_grid.csv` at revision `7ed3ff857940d3f4611be55f3c08c79525c32171` with its license notice. The browser lookup maps Metrica coordinates to grid rows and mirrors columns by attacking direction. |
| [SkillCorner Open Data](https://github.com/SkillCorner/opendata) | MIT; credit SkillCorner. | **Integrated.** A-League Men 2024/25 season aggregates (physical, off-ball runs, passing) give each candidate's measured top speed (PSV-99), time to sprint and out-of-possession intensity. Licence shipped in `src/data/skillcorner/LICENSE`. |
| [Transfermarkt datasets](https://github.com/dcaribou/transfermarkt-datasets) | CC0. | **Integrated.** Players linked on birthdate plus name: position, foot, height, 2024/25 market value, international caps. |
| [socceraction](https://socceraction.readthedocs.io/en/latest/documentation/valuing_actions/xT.html) | MIT. The inspected source targets Python 3.9–3.12 and uses pandas, NumPy, scikit-learn and pandera. | **Deferred.** `ExpectedThreat.fit` and `rate` work with SPADL event actions. Applying it here would require event conversion and a trained or pre-trained model. The FoT grid already provides a location value for this demo. |
| [Football Simulator](https://github.com/tbleckert/football-simulator) | MIT. `@bleckert/football-simulator` declares Node 18+ and an `events` runtime dependency. | **Deferred.** The inspected `RealTimeEngine` constructs state from two `Team` objects, starts at kickoff and exports snapshots via `simulate`/`tick`. It accepts an injected random function. No public API in the inspected implementation initializes it from an external tracking snapshot with ball ownership, velocities and intents. |

## Model and evidence

- **Recorded replay.** The original branch uses Metrica's 25 Hz tracking coordinates, with the source frame number retained. Both branches use the same ball and other 21 player positions. Each clip keeps its recorded outcome visible.
- **Modeled replacement.** Each candidate starts at the recorded player's position and estimated velocity, and moves with his measured settings:
  - top speed from SkillCorner's PSV-99;
  - acceleration and reaction delay from his time to sprint, against other players in his position;
  - engage range from his high-intensity running when his team doesn't have the ball.

  He accelerates and brakes like a sprinter. In transition and press his tactical point is fixed. In attack it is a support point six metres ahead of the recorded ball, capped at x = 98 m on y = 25 m. After the scenario cue and his reaction delay, he goes for the ball only when he can reach its projected path (the next 1.5 s, from its two latest positions) within his engage range of the tactical point; otherwise he holds that point. The projection never uses the recorded future.
- **Comparison.** Positioning is mean distance to the assigned tactical point. Reach is the share of frames from the cue up to the recorded recovery, tackle or shot in which the player is within 1.6 m of the ball. Reachable possession value is the maximum ball-location EPV for the team in possession, discounted linearly to zero over 4 m. It measures access to a location, without modeling ball height or successful control.
- **Momentum.** The chart sums the location EPV of recorded completed-pass destinations and shot origins by team in one-minute bins, takes Home minus Away over trailing three-minute windows, and scales by the largest absolute window. It uses the recorded event stream across the match. The marker identifies the replay start.
- **Coaching and scouting.** Recommendations cite the measured approach distance and reach. Role fit awards up to 40 points for positioning, 40 for proximity to the ball, and 20 for reachable EPV relative to peak EPV during the action. The first two components fall to zero at 12 m mean positioning error and 6 m closest approach, respectively. Scores describe the assigned role in the selected clip, and labels say "modeled fit" because they rest on one modeled run. The scouting card shows each candidate's club, age, position, market value and international caps (Transfermarkt) next to his measured numbers (SkillCorner). Confidence is low: the candidates' settings are measured, but each run is modeled in a different match from one clip.
