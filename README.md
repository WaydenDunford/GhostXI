# GhostXI

GhostXI compares a recorded football scenario with a modeled player replacement. The vertical slice uses Metrica Sample Game 1, from 00:10.04 to 00:18.04. Home 2 intercepts Away's pass at 00:15.12. The original 22 players and ball remain visible while the modeled replacement appears as a translucent ghost.

## Run the demo

From the GhostXI repository, using Node.js 20+ and Python 3:

```sh
npm ci
npm run prepare:data
python -m http.server 8764 --bind 127.0.0.1
```

Open [GhostXI locally](http://127.0.0.1:8764/). Select a replacement profile, click **Compare players**, then click **Play** or scrub past 4 seconds. The dotted player is the modeled replacement and the cross marks the assigned cover point. **Hide comparison** restores the original view. Run `npm test` after preparing the data to verify reproducibility, baseline preservation and the analytics.

The preparation step downloads the event file and a short tracking window from a pinned Metrica revision. The prepared JSON stays in the local checkout. Playback makes local requests for the prepared JSON and the vendored EPV grid.

## Reuse decisions

| Component | License and dependencies | Use in this slice |
| --- | --- | --- |
| [PitchKit](https://www.pitchkitjs.com/docs/data) | MIT. `@pitchkit/data-providers` 0.6.0 depends on `csv-parse`. `@pitchkit/react` 0.9.0 uses `@pitchkit/core` and requires React and React DOM 18+. | **Integrated with an adapter.** `fetchEvents`, `fetchTrackingWindow` and `attackingDirection` load Metrica data. The adapter joins the recorded window to its events and converts normalized coordinates to metres. Existing Canvas handles playback and the ghost overlay. |
| [Metrica Sports Sample Data](https://github.com/metrica-sports/sample-data#legal-stuff) | Publisher provides anonymized samples for analysis and requests public attribution. The repository has no explicit data license file. | **Integrated.** Fetches Game 1 locally from pinned revision `e706dd506b360d69d9d123d5b8026e7294b13996`. GhostXI credits Metrica Sports in the dashboard. |
| [Friends of Tracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking) | MIT. Full Python EPV and pitch-control code uses NumPy and the Metrica pandas pipeline. | **Integrated.** Reuses the 32×50 `EPV_grid.csv` at revision `7ed3ff857940d3f4611be55f3c08c79525c32171` with its license notice. The browser lookup maps Metrica coordinates to grid rows and mirrors columns by attacking direction. |
| [socceraction](https://socceraction.readthedocs.io/en/latest/documentation/valuing_actions/xT.html) | MIT. The inspected source targets Python 3.9–3.12 and uses pandas, NumPy, scikit-learn and pandera. | **Deferred.** `ExpectedThreat.fit` and `rate` work with SPADL event actions. Applying it here would require event conversion and a trained or pre-trained model. The FoT grid already provides a location value for this demo. |
| [Football Simulator](https://github.com/tbleckert/football-simulator) | MIT. `@bleckert/football-simulator` declares Node 18+ and an `events` runtime dependency. | **Deferred.** The inspected `RealTimeEngine` constructs state from two `Team` objects, starts at kickoff and exports snapshots via `simulate`/`tick`. It accepts an injected random function. No public API in the inspected implementation initializes it from an external tracking snapshot with ball ownership, velocities and intents. |

## Model and evidence

- **Recorded replay.** The original branch uses Metrica's 25 Hz tracking coordinates, with the source frame number retained. Both branches use the same ball and other 21 player positions. Home 2's recorded interception remains a fact in both views.
- **Modeled replacement.** Each hypothetical profile starts at Home 2's recorded position and estimated velocity. It approaches an assigned cover point at (29 m, 54.5 m), then reacts after its configured delay. While the pass is in flight, it projects the ball 0.24 seconds ahead using the two latest samples and limits its step away from cover. Speed and acceleration are bounded by the profile. There is no random sampling or simulation of a new ball path.
- **Comparison.** Positioning is mean distance to the cover point. Interception reach is the share of in-flight frames within 1.6 m of the ball. The sample at the recorded recovery is excluded from both branches. Reachable possession value is the maximum Away ball-location EPV discounted linearly to zero over 4 m. It is a geometric proxy for the threat within reach, with no estimate of ball height, successful control or goals.
- **Momentum.** The chart sums the location EPV of recorded completed-pass destinations and shot origins by team in one-minute bins, takes Home minus Away over trailing three-minute windows, and scales by the largest absolute window. It uses the recorded event stream across the match. The marker identifies the replay start.
- **Coaching and scouting.** Recommendations cite the measured approach distance and reach. The Home wide-cover fit awards up to 40 points for cover distance, 40 for proximity to the pass, and 20 for reachable EPV relative to peak EPV in the pass. Full losses in the first two components occur at 12 m mean cover error and 6 m closest approach, respectively. Scores describe this assigned role and clip. Confidence is low because both replacement profiles are hypothetical and there is no measured candidate history.
