# GhostXI behavior-agent MVP

This is an implemented, bounded behavior experiment: empirical StatsBomb event
preferences drive utility-based game agents in an anonymous Metrica scene.
It does not train a neural network. It does not claim to predict a real match outcome.

## What is ready

- Two profiles: Lamine Yamal (`statsbomb:316046`) and Bukayo Saka (`statsbomb:22084`).
- Twelve Spain/England matches before 14 July 2024 supply profile evidence; each
  player appears in six of these matches. The Euro 2024 final is held out.
- Yamal's sample has 387 pass/carry/shot events; Saka's has 500.
- Six context cells: defensive/middle/attacking third, under pressure or free.
- Player event mixes are smoothed toward an independent winger cohort with strength 20.
- Inward/forward carrying, forward passing, pass completion and wide activity are
  estimated separately with strength-eight smoothing. They are transparent frequencies.
- The eight-second modeled branch contains all 22 agents and the ball. The candidate
  chooses actions using its profile. Other players use shared support, marking,
  pressing, passing and ball-recovery rules.
- Decisions contain their source, context, preferences and evaluated option scores.
- A fixed unsigned 32-bit seed reproduces the same rollout.
- Both named candidates use identical assumed speed/acceleration limits; name, age
  and Transfermarkt value do not determine movement or action choice.

## Measured preparation time on this machine

The initial history download/compaction took **27.103 seconds**. Profile fitting took
**435.45 milliseconds** on the recorded build. These numbers exclude application
development and UI integration, and vary by machine/network/cache.
A local 20-run simulation benchmark measured approximately **17.4 ms median** and
**31.9 ms p95** per eight-second rollout. This is an MVP benchmark, not a load test.

## Preparation and startup

```sh
npm run prepare:data
npm run prepare:external
npm run prepare:ai
npm test
npm run start:api
```

The first two commands prepare the existing tracking and external data. The AI
command uses Python 3 to download a bounded history, then Node to fit and write
`src/data/ai/profiles.json`. Raw history is gitignored; the small derived profile
artifact is available without refitting on every server startup. The server never
downloads or refits in the background. Stop it with Ctrl+C.

## HTTP routes

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/ai/status` | Readiness and measured preparation times |
| GET | `/api/v1/ai/profiles` | Both profiles, methodology and source hashes |
| GET | `/api/v1/ai/profiles/:id` | One profile with evidence and held-out metrics |
| GET | `/api/v1/ai/scenarios` | Supported experiment and eligible profile IDs |
| POST | `/api/v1/ai/simulations` | Seeded alternative frames and decision trace |

Request body:

```json
{
  "matchId": "metrica-game-1",
  "momentId": "home-deep-pass-attack",
  "candidateId": "statsbomb:316046",
  "seed": 42
}
```

`seed` is optional (default 42). Other extra fields are rejected. The legacy
`/comparisons` route still evaluates the original three hypothetical profiles; the
new behavior experiment uses its own route and analysis contract.

Client calls:

```ts
const model = await api.getBehaviorProfiles();
const [scenario] = await api.getBehaviorScenarios();
const result = await api.runBehaviorSimulation({
  matchId: scenario.matchId,
  momentId: scenario.momentId,
  candidateId: model.profiles[0].id,
  seed: 42,
});
```

## Replay contract: important for Lovable

The experiment starts at the recorded first receiving opportunity (clip time **7.6 s**),
where the target is within 1.6 metres of the ball. Initial control of a grounded ball
is assumed. It is not proven by the two-dimensional observation.

- `recordedContextFrames`: the full original eight-second clip.
- `branchStartTimeSec`: 7.6 seconds into that original clip.
- `referenceFrames`: the remaining **0.4 seconds** of observed play, starting at time zero.
- `alternativeFrames`: **eight seconds** of modeled continuation, starting at the same
  recorded positions; 201 frames at 25 Hz.
- The alternative replaces the outgoing player ID with the incoming candidate ID.
- Use **all** positions and the ball from the selected alternative frame: other agents
  react and their trajectories diverge too.
- The reference ends after `referenceAvailableUntilSec`. Do not repeat/freeze its last
  frame and label the continuation observed. Display "Recorded reference ended".

For a clean demo, show the original context first, then "Start behavior experiment".
Use profile names from the profile response; other player labels come from the
Metrica match catalog. Show the source/assumption badges and decision timeline.
No result field is a real-match success probability or an overall talent rating.

## Decision method and limits

On-ball choices evaluate log empirical preference plus modeled tactical utility for
passing lanes, pressure and goal distance. Seeded small noise allows reproducible
variation. Pressure in the simulation is approximated by an opponent within five
metres; the training flag is StatsBomb's recorded `under_pressure` annotation.

Off-ball choices offer width, inward movement, forward runs and passing support.
Transferring on-ball spatial preferences to these targets is explicitly an assumption,
not measured off-ball behavior. Other agents are generic rather than personalized.
Grounded ball flight, nearby control and tackling are heuristic. Offside, body
collisions, aerial duels, fatigue, fouls and validated goalkeeper/goal models are absent.
If a modeled shot reaches the goal line, the output reports that event rather than
asserting a goal or a goal probability.

The held-out final evaluates event-type frequency log loss only, not movement:
Yamal's personalized profile is slightly worse than the cohort baseline on this one
match; Saka's is slightly better. The artifact reports both numbers. There is no
demonstrated general predictive improvement from this small sample.

Two Saka lineup histories contain contradictory position-period intervals. Their
minutes remain unknown (`sample.minutes: null`, `unknownMinutesMatchCount: 2`);
their recorded action events remain usable. Fitting uses event counts, not fabricated
minutes or per-90 rates. All history dates precede the held-out final.

## Demonstration and verification

For the identical starting state and seed 42, the current Yamal profile first selects
a shot and the current Saka profile first selects a pass. These are model outputs,
not claims about what the real players would have done. Changing their habit evidence
changes decisions; changing their display names or market identities does not.

Tests cover chronology, context priors, repeatable rollouts, matching initial states,
22-player completeness, pitch boundaries, per-step speed limits, profile causality,
reactive ball/agent events and the complete HTTP/client flow. No ProdReady scan or
SDLC workflow is run by these commands.
