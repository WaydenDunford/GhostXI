# Real-Data Scouting Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GhostXI's three invented substitutes with 12 real A-League 2024/25 players. Their
measured SkillCorner numbers drive an improved movement model, and a scouting card shows their
Transfermarkt and StatsBomb context.

**Architecture:**
- **Data, prepared once:** a Node script (`scripts/prepare-scouting.js`, built from small pure
  modules in `scripts/scouting/`) downloads SkillCorner, Transfermarkt and StatsBomb open data once
  and writes a committed `src/data/scouting-candidates.json`.
- **Browser:** `attachCandidates` merges those candidates into the Metrica match.
  `simulateAlternative` reads each candidate's `settings` and moves him with an
  acceleration-limited "arrive" rule, plus a reachability check that decides whether he goes for
  the ball.
- **Card:** the dashboard renders a scouting card from a pure `scoutingCardLines` function.

**Tech Stack:** Node ≥ 20 (ES modules, global `fetch`, `node:test`), plain browser JavaScript, no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-real-data-scouting-design.md`

## Global Constraints

- **Code**
  - No new npm dependencies; browser code stays plain ES modules; deterministic, no randomness.
  - Keep these signatures:
    - `simulateAlternative({ match, momentId, candidateId })`
    - `analyzeScenario({ match, momentId, simulation, possessionValue })`
    - `mountDashboard(root, { match, onMomentChange, onCandidateChange, onCompare, onSeek, onPlayPause, onReset })`
- **Sources**
  - SkillCorner `aus1league_{physical,obr,passing}aggregates_20242025.csv` from
    `https://raw.githubusercontent.com/SkillCorner/opendata/master/data/aggregates/`.
  - Transfermarkt `players.csv.gz`, `player_valuations.csv.gz` and `national_teams.csv.gz` from
    `https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/`.
  - StatsBomb `matches`, `lineups` and `events` from
    `https://raw.githubusercontent.com/statsbomb/open-data/master/data/`. Competition/season ids:
    World Cup 2018 `43/3`, World Cup 2022 `43/106`, Euro 2020 `55/43`, Euro 2024 `55/282`,
    Copa América 2024 `223/282`, AFCON 2023 `1267/107`.
- **Scenario → SkillCorner group** (also the fill order):
  `home-wide-interception` → `Central Defender`, `home-defensive-press` → `Full Back`,
  `home-deep-pass-attack` → `Wide Attacker`.
- **Eligibility:** `minutes_full_all × count_match ≥ 900` in that group's row.
- **Settings** (p = percentile in the group, best = 1):
  - `topSpeed = psv99 / 3.6`
  - `acceleration = 4.0 + 2.0·p_sprint`
  - `reaction = 0.48 − 0.32·p_sprint`
  - `engageRange = 3 + 6·p_oop`
- **Dates:** valuation window 2024-07-01 to 2025-06-30 inclusive; age in whole years at 2025-06-30.
- **Model:** projection horizon 1.5 s; ball velocity cap 30 m/s; tactical points, cue and action end
  unchanged (the attack support point stays 6 m ahead of the ball).
- **Copy, verbatim:** "may include youth caps", "position median", "No 2024/25 valuation",
  "now at <club>", and the sources line `SkillCorner (A-League Men 2024/25) · Transfermarkt · StatsBomb`.
- **Credit:** SkillCorner's MIT licence ships next to the JSON; StatsBomb's logo appears next to tournament lines.
- **Honesty:** never tune ranges to widen gaps between candidates. If a clip shows near-identical
  runs, report it with the numbers.
- **Working tree:** `docs/superpowers/` stays uncommitted (Fatih keeps planning docs out of the
  repo). Raw downloads stay in memory, never written into the repo.

## Review Focus

1. **Stationary ball, or a projected path that leaves the pitch:** no division by zero, and no
   chasing a point beyond the touchline. Test in Task 7.
2. **A shortlisted player with empty out-of-possession columns:** gets the group median, marked
   `"outOfPossession"` in `filled`, and the card says "position median". Tests in Tasks 2 and 9.
3. **Two Transfermarkt players with the same birthdate and the same surname plus initial:** no
   link; the card says "no Transfermarkt record". Tests in Tasks 1 and 9.
4. **A player whose only valuation predates 2024/25:** `older: true`, never picked as the hidden
   talent, and the card shows the older value with its date and club. Tests in Tasks 1, 3 and 9.
5. **A stale scouting file with no shortlist for a moment:** `attachCandidates` throws
   `No scouting shortlist for moment '<id>'.`, which `main.js`'s existing error message shows. Test in Task 6.

Shared test helper, used in every test file that compares floats:
`const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);`

---

### Task 1: Source parsing, name linking and season valuation

**Files:**
- Create: `scripts/scouting/sources.js`
- Test: `test/scouting-sources.test.js`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): Record<string, string>[]`: header row, quoted fields, doubled quotes, CRLF.
  - `normaliseName(name: string): string`: NFD, strip diacritics, lowercase, non-letters → space,
    collapse spaces, trim.
  - `indexByBirthdate(players: TmPlayer[]): Map<string, TmPlayer[]>`, keyed by the first 10
    characters of `date_of_birth`.
  - `linkTransfermarkt(row: { player_name, player_short_name, player_birthdate }, index): TmPlayer | null`.
    Among same-birthdate players, try in order: full name equal, short name equal, last token plus
    first initial equal. The first rule with exactly one hit wins; a rule with two or more hits → `null`.
  - `seasonValuation(rows: { date, market_value_in_eur, current_club_name }[]): { eur, date, club, older } | null`.
    Use the last row inside the window (`older: false`). Else use the last row before 2024-07-01
    (`older: true`). Rows after the window are ignored. Nothing → `null`.

- [ ] **Step 1: Write the failing tests**

```js
test("parseCsv keeps quoted commas and doubled quotes", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [{ a: "x, y", b: 'say "hi"' }]);
});
test("normaliseName strips accents, case and extra spaces", () => {
  assert.equal(normaliseName("Aleksandar Šušnjar"), "aleksandar susnjar");
  assert.equal(normaliseName("Storm  Roux"), "storm roux");
});
test("linkTransfermarkt needs the birthdate and refuses ambiguous names", () => {
  const behich = { player_id: "1", name: "Aziz Eraltay Behich", date_of_birth: "1990-12-16 00:00:00" };
  const index = indexByBirthdate([behich, { player_id: "2", name: "Bob Behich", date_of_birth: "1990-12-16" }]);
  assert.equal(linkTransfermarkt({ player_name: "Aziz Behich", player_short_name: "A. Behich", player_birthdate: "1990-12-16" }, index), behich);
  assert.equal(linkTransfermarkt({ player_name: "Aziz Behich", player_short_name: "", player_birthdate: "1990-12-17" }, index), null);
  const twins = indexByBirthdate([
    { player_id: "3", name: "Sam Jones", date_of_birth: "1999-01-01" },
    { player_id: "4", name: "Steve Jones", date_of_birth: "1999-01-01" },
  ]);
  assert.equal(linkTransfermarkt({ player_name: "S Jones", player_short_name: "S. Jones", player_birthdate: "1999-01-01" }, twins), null);
});
test("seasonValuation uses the last 2024/25 value and flags older ones", () => {
  const rows = [
    { date: "2024-03-01", market_value_in_eur: "300000", current_club_name: "A" },
    { date: "2024-12-15", market_value_in_eur: "450000", current_club_name: "B" },
    { date: "2025-06-30", market_value_in_eur: "500000", current_club_name: "B" },
    { date: "2025-09-01", market_value_in_eur: "700000", current_club_name: "C" },
  ];
  assert.deepEqual(seasonValuation(rows), { eur: 500000, date: "2025-06-30", club: "B", older: false });
  assert.deepEqual(seasonValuation([{ date: "2023-05-31", market_value_in_eur: "600000", current_club_name: "AEK Larnaca" }]),
    { eur: 600000, date: "2023-05-31", club: "AEK Larnaca", older: true });
  assert.equal(seasonValuation([]), null);
});
```

- [ ] **Step 2: Run** `node --test test/scouting-sources.test.js`. Expected: FAIL, cannot find module `scripts/scouting/sources.js`.
- [ ] **Step 3: Implement the five exports in `scripts/scouting/sources.js`.**
- [ ] **Step 4: Run** the same command. Expected: 4 pass.
- [ ] **Step 5: Commit** `git add scripts/scouting/sources.js test/scouting-sources.test.js && git commit -m "feat(scouting): parse sources, link Transfermarkt players, pick the 2024/25 valuation"`

### Task 2: Measures, percentiles and settings

**Files:**
- Create: `scripts/scouting/profile.js`
- Test: `test/scouting-profile.test.js`

**Interfaces:**
- Consumes: rows from `parseCsv` (Task 1).
- Produces:
  - `dedupeGroup(rows, group: string): Row[]`: one row per `player_id` with that `position_group`.
    Keep the row with more `count_match`, then more `minutes_full_all`, then lower `team_id`.
  - `minutesInPosition(row): number`: `minutes_full_all × count_match`.
  - `percentile(value, population: number[], higherIsBetter: boolean): number`: count of values
    strictly worse ÷ (n − 1); 0.5 when n = 1.
  - `measureGroup(rows): Map<string, Measures>`, keyed by `player_id`, over `dedupeGroup` output.
    - Shape: `Measures = { psv99Kmh, psv99Percentile, timeToSprintS, sprintPercentile, oopHiPerMin, oopPercentile, minutes, matches, filled: string[] }`.
    - `oopHiPerMin = hi_distance_full_otip / minutes_full_otip`.
    - Percentile populations: every row of the group that has the value; lower time to sprint is better.
    - A missing time to sprint → `sprintPercentile 0.5` and `"timeToSprint"` in `filled`.
    - A missing out-of-possession value → `oopPercentile 0.5` and `"outOfPossession"` in `filled`.
  - `settingsFromMeasures(m): { topSpeed, acceleration, reaction, engageRange }`, using the
    Global Constraints formulas, each rounded to 3 decimals.

- [ ] **Step 0: Check SkillCorner's definitions.** Read the physical-data glossary
  (`https://skillcorner.crunch.help/en/glossaries/physical-data-glossary`). Note the definitions of
  PSV-99, time to sprint and the in/out-of-possession splits in a comment at the top of `profile.js`.
  Keep the percentile mapping for acceleration and reaction. Switch acceleration to a direct formula
  only if the glossary gives an unambiguous starting speed for "time to sprint"; then change the
  settings test to match and say why in the commit.
- [ ] **Step 1: Write the failing tests**

```js
test("percentile counts values strictly worse", () => {
  close(percentile(30, [26, 28, 30, 32], true), 2 / 3);
  close(percentile(1.2, [1.2, 1.4, 1.6], false), 1);
  close(percentile(5, [5], true), 0.5);
});
test("settings follow the spec's formulas", () => {
  assert.deepEqual(settingsFromMeasures({ psv99Kmh: 30.6, sprintPercentile: 0.75, oopPercentile: 0.5 }),
    { topSpeed: 8.5, acceleration: 5.5, reaction: 0.24, engageRange: 6 });
});
test("missing measures use the position median and are marked", () => {
  const row = (player_id, psv99, timetosprint_top3, hi_distance_full_otip) => ({ player_id, position_group: "Full Back",
    psv99, timetosprint_top3, hi_distance_full_otip, minutes_full_otip: "30", minutes_full_all: "90", count_match: "10", team_id: "1" });
  const m = measureGroup([row("A", "30", "1.3", "300"), row("B", "28", "", "240"), row("C", "32", "1.5", "")]);
  close(m.get("A").psv99Percentile, 0.5); close(m.get("A").sprintPercentile, 1); close(m.get("A").oopHiPerMin, 10);
  close(m.get("B").sprintPercentile, 0.5); assert.deepEqual(m.get("B").filled, ["timeToSprint"]);
  close(m.get("C").oopPercentile, 0.5); assert.deepEqual(m.get("C").filled, ["outOfPossession"]);
});
test("dedupeGroup keeps the club row with more matches", () => {
  const rows = [{ player_id: "9", position_group: "Full Back", count_match: "4", minutes_full_all: "90", team_id: "1" },
    { player_id: "9", position_group: "Full Back", count_match: "12", minutes_full_all: "80", team_id: "2" }];
  assert.equal(dedupeGroup(rows, "Full Back")[0].team_id, "2");
});
```

- [ ] **Step 2: Run** `node --test test/scouting-profile.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement the five exports in `scripts/scouting/profile.js`.**
- [ ] **Step 4: Run** the same command. Expected: 4 pass.
- [ ] **Step 5: Commit** `git commit -m "feat(scouting): derive measured settings from SkillCorner percentiles"` (with both files added).

### Task 3: Shortlist

**Files:**
- Create: `scripts/scouting/shortlist.js`
- Test: `test/scouting-shortlist.test.js`

**Interfaces:**
- Consumes: `minutesInPosition` and `Measures` (Task 2); `seasonValuation` results (Task 1).
- Produces: `pickShortlists(scenarios: { scenarioId, rows }[], measures: Map<scenarioId, Map<playerId, Measures>>, valuations: Map<playerId, Valuation | null>): Record<scenarioId, { playerId, pick }[]>`.
  `pick` is one of `"fastest" | "outOfPossession" | "acceleration" | "hiddenTalent"`.
- Rules:
  - Process scenarios in input order; only players with `minutesInPosition ≥ 900` are eligible.
  - Picks, in order:
    - `fastest`: highest `psv99Kmh`.
    - `outOfPossession`: highest non-null `oopHiPerMin`.
    - `acceleration`: lowest non-null `timeToSprintS`.
    - `hiddenTalent`: among eligible players whose valuation has `older === false` and `eur`
      strictly below the median of those players' `eur` (mean of the two middle values when the
      count is even), the best mean of `psv99Percentile`, `oopPercentile` and `sprintPercentile`.
  - A player already picked anywhere is skipped. Ties go to the lower numeric `player_id`.

- [ ] **Step 1: Write the failing tests.** Build the fixtures with a helper that writes `Measures`
  and rows directly:
  - **Duplicates across scenarios:** player `"7"` is the fastest in both of two scenarios →
    `result.first` contains `"7"`, `result.second` does not, and `result.second` still has 4 picks.
  - **Median rule:** eligible values €200k, €300k, €400k, €500k → median €350k → the hidden talent
    is whichever of the €200k and €300k players has the better mean percentile.
  - **Older valuation:** a player with the best mean percentile but `older: true` is never `hiddenTalent`.
  - **Ties:** two players at the same `psv99Kmh` → `"9"` is picked over `"12"` (numeric order,
    not text order).
  - **Minutes:** a player at 899 minutes is never picked.
- [ ] **Step 2: Run** `node --test test/scouting-shortlist.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement `pickShortlists`.**
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "feat(scouting): pick four role-matched candidates per scenario"`.

### Task 4: National-team record

**Files:**
- Create: `scripts/scouting/national.js`
- Test: `test/scouting-national.test.js`

**Interfaces:**
- Consumes: `normaliseName` (Task 1).
- Produces:
  - `nationalRecord(tm, nationalTeamsById: Map<string, { name }>): { caps, goals, team: string | null, citizenship, youthCapsPossible }`.
    `team` is the name for `current_national_team_id` when listed, else `null`;
    `youthCapsPossible = team === null`.
  - `findInLineups(name, country, lineups: { matchId, teamName, lineup }[]): { matchId, statsbombName, positions }[]`.
    Only squads whose normalised `teamName` equals the normalised `country` are searched. Names
    match as in `linkTransfermarkt` (full name, then last token plus first initial); a squad with
    two hits is skipped. Only entries with at least one position count.
  - `minutesPlayed(positions: { from: "mm:ss", to: "mm:ss" | null }[], matchEndMinute): number`.
    A `to` of `null` means the match end, taken as the minute of the match's last event including seconds.
  - `tournamentLine(events, statsbombName, minutes): { pressuresPer90, tacklesInterceptionsPer90, recoveriesPer90, passCompletion }`.
    - Counts by `type.name`: `"Pressure"`; `"Duel"` with `duel.type.name === "Tackle"` plus
      `"Interception"`; `"Ball Recovery"`; `"Pass"`, which is complete when it has no `pass.outcome`.
    - Per-90 values are rounded to 1 decimal. `passCompletion` is rounded to 0.01, or `null` with no passes.

- [ ] **Step 1: Write the failing tests**

```js
test("tournamentLine counts StatsBomb event types per 90", () => {
  const ev = (name, extra = {}) => ({ type: { name }, player: { name: "Aziz Eraltay Behich" }, ...extra });
  const events = [ev("Pressure"), ev("Pressure"), ev("Pressure"), ev("Duel", { duel: { type: { name: "Tackle" } } }),
    ev("Interception"), ev("Ball Recovery"), ev("Ball Recovery"), ev("Pass"), ev("Pass"), ev("Pass"),
    ev("Pass", { pass: { outcome: { name: "Incomplete" } } }), { ...ev("Pressure"), player: { name: "Someone Else" } }];
  assert.deepEqual(tournamentLine(events, "Aziz Eraltay Behich", 90),
    { pressuresPer90: 3, tacklesInterceptionsPer90: 2, recoveriesPer90: 2, passCompletion: 0.75 });
});
test("minutesPlayed uses the match end for an open position", () => {
  close(minutesPlayed([{ from: "00:00", to: null }], 94.5), 94.5);
  close(minutesPlayed([{ from: "60:00", to: null }], 93), 33);
});
test("findInLineups searches only the player's country and skips ambiguity", () => {
  const lineups = [
    { matchId: 1, teamName: "Australia", lineup: [{ player_name: "Aziz Eraltay Behich", positions: [{ from: "00:00", to: null }] }] },
    { matchId: 2, teamName: "Denmark", lineup: [{ player_name: "Aziz Eraltay Behich", positions: [{ from: "00:00", to: null }] }] },
    { matchId: 3, teamName: "Australia", lineup: [{ player_name: "Adam Behich", positions: [{ from: "00:00", to: null }] },
      { player_name: "Alan Behich", positions: [{ from: "00:00", to: null }] }] },
  ];
  assert.deepEqual(findInLineups("Aziz Behich", "Australia", lineups).map(({ matchId }) => matchId), [1]);
});
test("nationalRecord leaves the team empty when Transfermarkt lists none", () => {
  assert.deepEqual(nationalRecord({ international_caps: "61", international_goals: "4", current_national_team_id: "",
    country_of_citizenship: "Australia" }, new Map()),
    { caps: 61, goals: 4, team: null, citizenship: "Australia", youthCapsPossible: true });
});
```

- [ ] **Step 2: Run** `node --test test/scouting-national.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement the four exports.**
- [ ] **Step 4: Run.** Expected: 4 pass.
- [ ] **Step 5: Commit** `git commit -m "feat(scouting): national-team caps and StatsBomb tournament lines"`.

### Task 5: Pipeline script and committed candidate data

**Files:**
- Create:
  - `scripts/prepare-scouting.js`
  - `src/data/scouting-candidates.json` (generated)
  - `src/data/skillcorner/LICENSE` (from `https://raw.githubusercontent.com/SkillCorner/opendata/master/LICENSE`)
- Modify:
  - `package.json`: add the script `"prepare:scouting": "node scripts/prepare-scouting.js"`.
  - `README.md`: add SkillCorner, Transfermarkt and StatsBomb rows to "Reuse decisions", and the
    `npm run prepare:scouting` command.
- Test: `test/scouting-data.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces `src/data/scouting-candidates.json`:

```json
{
  "competition": "A-League Men", "season": "2024/25",
  "sources": [
    { "name": "SkillCorner Open Data", "licence": "MIT", "url": "https://github.com/SkillCorner/opendata" },
    { "name": "Transfermarkt datasets", "licence": "CC0", "url": "https://github.com/dcaribou/transfermarkt-datasets" },
    { "name": "StatsBomb Open Data", "licence": "Free; credit StatsBomb and show its logo", "url": "https://github.com/statsbomb/open-data" }
  ],
  "shortlists": { "home-wide-interception": ["sc-<player_id>"], "home-defensive-press": [], "home-deep-pass-attack": [] },
  "candidates": [{
    "id": "sc-<player_id>", "name": "", "club": "", "clubNow": null, "positionGroup": "", "pick": "fastest", "age": 0,
    "transfermarkt": { "position": "", "subPosition": "", "foot": "", "heightCm": 0,
      "marketValue": { "eur": 0, "date": "", "club": "", "older": false } },
    "measured": { "psv99Kmh": 0, "psv99Percentile": 0, "timeToSprintS": null, "sprintPercentile": 0, "oopHiPerMin": 0,
      "oopPercentile": 0, "minutes": 0, "matches": 0, "offBallRunsPer30": 0, "runsInBehindPer30": 0,
      "dangerousRunsPer30": 0, "passCompletion": 0, "lineBreakingPer30": 0 },
    "filled": [],
    "settings": { "topSpeed": 0, "acceleration": 0, "reaction": 0, "engageRange": 0 },
    "national": { "caps": 0, "goals": 0, "team": null, "citizenship": "", "youthCapsPossible": true,
      "tournaments": [{ "name": "FIFA World Cup 2022", "team": "Australia", "matches": 0, "minutes": 0,
        "pressuresPer90": 0, "tacklesInterceptionsPer90": 0, "recoveriesPer90": 0, "passCompletion": 0 }] }
  }]
}
```

- **Script details:**
  - **Card-only columns:** from the `obr` and `passing` files, joined on `player_id` +
    `position_group`: `offballrun_count_p30tip`, `behindrun_count_p30tip`,
    `offballrun_count_dangerous_p30tip`, `pass_pct_completed` (stored as 0–1),
    `pass_count_linebreak_completed_p30tip`.
  - **Club label:** SkillCorner `team_name` without a trailing " Football Club". `clubNow` is
    Transfermarkt's `current_club_name` when it differs after `normaliseName` and removing the
    words "fc" and "football club".
  - **`transfermarkt`:** `null` when there is no link.
  - **StatsBomb:** fetched only for the 12 shortlisted players, and events only for matches in
    which one of them has positions.
  - **Writing:** a temporary file plus rename, as `prepare-data.js` does. Log each scenario's 4
    picks with their settings.

- [ ] **Step 1: Write the failing data test** against the committed file:
  - three shortlists keyed by the scenario ids, 4 ids each, 12 unique overall, and every id has a candidate;
  - settings bounds: `6.7 ≤ topSpeed ≤ 9.0`, `4 ≤ acceleration ≤ 6`, `0.16 ≤ reaction ≤ 0.48`, `3 ≤ engageRange ≤ 9`;
  - `filled ⊆ ["timeToSprint", "outOfPossession"]`;
  - each scenario holds the four pick kinds once;
  - every `hiddenTalent` has `transfermarkt.marketValue.older === false`;
  - the source names include all three;
  - `src/data/skillcorner/LICENSE` contains "MIT".
- [ ] **Step 2: Run** `node --test test/scouting-data.test.js`. Expected: FAIL, file not found.
- [ ] **Step 3: Implement `scripts/prepare-scouting.js`** and add the npm script, the LICENSE and the README rows.
- [ ] **Step 4: Run** `npm run prepare:scouting`. Expected: three lines of 4 picks and the
  file written. Then run the data test. Expected: PASS.
- [ ] **Step 5: Hand-check all 12 cards against Transfermarkt and StatsBomb.** Check name,
  birthdate, club, market value date, and tournament team and match count. Write "12 identities
  checked" in the commit message, or fix the linking first.
- [ ] **Step 6: Commit** the script, JSON, LICENSE, `package.json`, `README.md` and the test:
  `git commit -m "feat(scouting): generate real A-League candidates from SkillCorner, Transfermarkt and StatsBomb"`.

### Task 6: Attach candidates to the match

**Files:**
- Create: `src/data/scouting.js`
- Test: `test/scouting-attach.test.js`

**Interfaces:**
- Consumes: the JSON shape from Task 5.
- Produces: `attachCandidates(recording, scouting): Match`, a new object.
  - `players` = the recording's players plus, per candidate,
    `{ id, displayName: "<name> (<club>)", team: "HOME", role: positionGroup, age, settings, scouting: <candidate record> }`.
  - Each moment gets `candidatePlayerIds = scouting.shortlists[moment.id]`.
  - Throws `No scouting shortlist for moment '<id>'.` or `Unknown scouting candidate '<id>'.`
  - Never mutates its inputs.

- [ ] **Step 1: Write the failing tests:**
  - with a two-moment recording fixture and a scouting fixture, shapes and order are as above;
  - a scouting fixture without one moment's shortlist throws exactly `No scouting shortlist for moment 'm2'.`;
  - both inputs deep-equal their `structuredClone` copies taken before the call.
- [ ] **Step 2: Run** `node --test test/scouting-attach.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement `attachCandidates`.**
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "feat(scouting): attach real candidates to the tracked match"`.

### Task 7: Movement rules

**Files:**
- Create: `src/simulation/movement.js`
- Test: `test/movement.test.js`

**Interfaces:**
- Produces:
  - `timeToReach(distance, approachSpeed, acceleration, topSpeed): number` (seconds).
  - `arriveVelocity(position, velocity, target, settings, dt): { x, y }`.
  - `interceptionTarget({ position, velocity, ball, previousBall, dt, tacticalPoint, settings, pitch, horizon = 1.5 }): { x, y } | null`.

Algorithm (the signatures don't determine it):

```js
// timeToReach: accelerate from the approach speed s0 (clamped to [0, topSpeed]), then cruise.
const tAcc = (topSpeed - s0) / acceleration, dAcc = s0 * tAcc + 0.5 * acceleration * tAcc ** 2;
return distance <= dAcc ? (Math.sqrt(s0 ** 2 + 2 * acceleration * distance) - s0) / acceleration
  : tAcc + (distance - dAcc) / topSpeed;

// arriveVelocity: brake only as much as needed to stop at the target.
// desiredSpeed = min(topSpeed, √(2 · acceleration · gap)); desired = unit(target − position) · desiredSpeed (zero when gap ≈ 0);
// return velocity + capVector(desired − velocity, acceleration · dt).

// interceptionTarget: earliest reachable point on the ball's projected path within the engage range.
// u = capVector((ball − previousBall) / dt, 30)
// for k = 1, 2, … while k·dt ≤ horizon: t = k·dt; point = ball + u·t
//   stop at the first point outside the pitch; skip points farther than settings.engageRange from tacticalPoint;
//   s0 = clamp(velocity · unit(point − position), 0, topSpeed)   (0 when point = position)
//   return point when timeToReach(|point − position|, s0, acceleration, topSpeed) ≤ t
// return null
```

- [ ] **Step 1: Write the failing tests**

```js
test("timeToReach accelerates, then cruises", () => {
  close(timeToReach(2.5, 0, 5, 8), 1);      // ½·5·1² = 2.5 m
  close(timeToReach(10, 0, 5, 8), 2.05);    // 1.6 s to 8 m/s covers 6.4 m, then 3.6 m at 8 m/s
  close(timeToReach(10, 8, 5, 8), 1.25);
  close(timeToReach(0, 0, 5, 8), 0);
});
test("arriveVelocity respects acceleration, top speed and braking", () => {
  const s = { topSpeed: 8, acceleration: 5 };
  close(arriveVelocity({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }, s, 0.04).x, 0.2);
  close(arriveVelocity({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 100, y: 0 }, s, 0.04).x, 8);
  close(arriveVelocity({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 1, y: 0 }, s, 0.04).x, 7.8);
});
test("a quicker player meets the ball earlier; a narrow engage range holds", () => {
  const pitch = { length: 105, width: 68 };
  const base = { position: { x: 12, y: 3 }, velocity: { x: 0, y: 0 }, ball: { x: 0, y: 0 }, previousBall: { x: -0.4, y: 0 },
    dt: 0.04, tacticalPoint: { x: 12, y: 3 }, pitch };
  const fast = interceptionTarget({ ...base, settings: { topSpeed: 9, acceleration: 6, engageRange: 6 } });
  const slow = interceptionTarget({ ...base, settings: { topSpeed: 7, acceleration: 4, engageRange: 6 } });
  close(fast.x, 10.8, 1e-6); close(fast.y, 0);
  close(slow.x, 12.4, 1e-6);
  assert.equal(interceptionTarget({ ...base, settings: { topSpeed: 9, acceleration: 6, engageRange: 1 } }), null);
});
test("a still ball is met where it lies; a path leaving the pitch is not chased", () => {
  const pitch = { length: 105, width: 68 };
  const still = interceptionTarget({ position: { x: 8, y: 3 }, velocity: { x: 0, y: 0 }, ball: { x: 10, y: 3 },
    previousBall: { x: 10, y: 3 }, dt: 0.04, tacticalPoint: { x: 8, y: 3 }, pitch, settings: { topSpeed: 9, acceleration: 6, engageRange: 6 } });
  assert.deepEqual(still, { x: 10, y: 3 });
  assert.equal(interceptionTarget({ position: { x: 90, y: 34 }, velocity: { x: 0, y: 0 }, ball: { x: 104, y: 34 },
    previousBall: { x: 103.6, y: 34 }, dt: 0.04, tacticalPoint: { x: 90, y: 34 }, pitch,
    settings: { topSpeed: 9, acceleration: 6, engageRange: 9 } }), null);
});
```

- [ ] **Step 2: Run** `node --test test/movement.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement the three exports in `src/simulation/movement.js`.**
- [ ] **Step 4: Run.** Expected: 4 pass.
- [ ] **Step 5: Commit** `git commit -m "feat(simulation): sprint-limited movement and a reachability check"`.

### Task 8: Switch the app to real candidates

These files change together because removing `replacementProfiles` breaks all of them at once.

**Files:**
- Modify:
  - `src/simulation/alternative.js` (whole file)
  - `src/main.js`
  - `scripts/prepare-data.js`
  - `src/analytics/decisionSupport.js`
  - `test/tracked-scenario.test.js`
- Create: `scripts/report-candidates.js`, `test/alternative.test.js`

**Interfaces:**
- Consumes: `attachCandidates` (Task 6); the movement rules (Task 7); `Player.settings` and `Player.scouting`.
- Produces: `simulateAlternative` keeps its existing return fields, adds `engagedFrames: boolean[]`,
  and no longer exports `replacementProfiles`.

**`alternative.js`:**
- The profile comes from `match.players`. When a frame is at or after `cueTime + settings.reaction`
  and its `sourceFrame < action.endFrame`: `target = interceptionTarget(…) ?? tacticalPoint`, and
  `engagedFrames[i]` is true when the target is not the tactical point.
- Velocity comes from `arriveVelocity`; the position is clamped to the pitch. Start position and
  `initialVelocity` are unchanged.
- The error for a candidate without settings or outside the shortlist is
  `Choose a candidate from this moment's shortlist.`
- `assumptions` (exact copy; numbers with `toFixed(2)`):
  1. "The replacement starts at the recorded player's position and estimated velocity."
  2. `${name} (${age}) moves with his 2024/25 A-League measurements (SkillCorner): top speed ${topSpeed} m/s, acceleration ${acceleration} m/s², reaction ${reaction} s, engage range ${engageRange} m.`
  3. `After the cue and his reaction delay, he goes for the ball only when he can reach its projected path (next 1.5 s, from its last two positions) within ${engageRange} m of his tactical point; otherwise he holds that point.`
  4. "The ball and all other players follow their recorded paths. The modeled run does not change possession or score."

**`main.js`:** load `./data/scouting-candidates.json` with the other files, then
`match = { ...attachCandidates(recording, scouting), momentum: buildMomentum(recording, possessionValue) }`.

**`prepare-data.js`:** drop the `replacementProfiles` import, its validation, and `candidatePlayerIds`.

**`decisionSupport.js`** (exact copy):
- `caveat`: `Settings come from ${name}'s 2024/25 A-League measurements (SkillCorner). The run is still a modeled estimate in a different match. This one-clip score describes fit for Home's assigned ${role} role.`
- `qualityLabel`: `Low confidence · One clip · Measured player attributes`
- New reasoning line:
  - engaged: `He went for the ball from ${seconds} s, when its path came within his ${engageRange} m engage range.`
    `seconds` is the clip time of the first engaged frame, to 1 decimal.
  - not engaged: `He held the ${point}: the ball never came within his ${engageRange} m engage range in time.`
- In `comparison`, "The modeled profile" becomes "The modeled run".

**`report-candidates.js`:** prints one row per moment and candidate: pick, top speed, first engaged
second (or "held"), closest approach, mean distance to the tactical point, score.

- [ ] **Step 1: Write the failing tests.**
  - **`test/alternative.test.js`**, using a synthetic match built in the test (76 frames at 25 Hz;
    the ball goes from (0, 30) to (30, 30) at 10 m/s; target `P` stands at (14, 34); cue at frame 0;
    anchor (14, 34)), with candidates
    `fast { topSpeed: 9, acceleration: 6, reaction: 0.16, engageRange: 9 }` and
    `slow { topSpeed: 7, acceleration: 4, reaction: 0.48, engageRange: 3 }`:
    - `fast` has some `engagedFrames`; `slow` has none;
    - `fast`'s closest approach to the ball is smaller than `slow`'s;
    - two runs are deep-equal;
    - an unknown candidate throws `/shortlist/`.
  - **`test/tracked-scenario.test.js`:** build `match` with `attachCandidates`. Each moment has 4
    candidates, each with `settings`. Baselines are equal across all 4. Keep the remaining
    assertions, but delete the old transition pins (73 and 71) for now.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL in the files above (`replacementProfiles`, missing `engagedFrames`).
- [ ] **Step 3: Implement** the changes in the five modified files and create `report-candidates.js`.
- [ ] **Step 4: Run** `node scripts/report-candidates.js`.
  - Pin the transition clip's first two candidates' scores and metric pairs from this output in
    `tracked-scenario.test.js`, where the old 73 and 71 pins were.
  - If any clip shows near-identical runs (all closest approaches within 0.5 m and the same
    engage pattern), keep the numbers as they are and say so in the commit message.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `git commit -m "feat: real A-League candidates drive the improved movement model"`,
  with the report table in the message body.

### Task 9: Scouting card

**Files:**
- Create: `src/ui/scoutingCard.js`, `src/ui/assets/statsbomb-logo.png` (official logo from `https://statsbomb.com/media-pack/`)
- Modify: `src/ui/dashboard.js`, `src/ui/ui.css`
- Test: `test/scouting-card.test.js`

**Interfaces:**
- Consumes: `Player.scouting` (Task 6).
- Produces:
  - `scoutingCardLines(player): { className, text }[]`, pure; empty when `player.scouting` is absent.
  - `dashboard.js` gains a `.gx-scouting` block at the top of the analysis panel. It refreshes
    whenever the selected candidate changes, both before and after Compare. Each line becomes
    `<p class>`, and the StatsBomb logo (`<img alt="StatsBomb">`) precedes each tournament line.

**Lines** (exact copy; km/h, s and m to 1 decimal; percentages whole; money as `€1.2m` for 1,000,000
and above, otherwise `€450k`; group plurals "centre-backs", "full-backs", "wide attackers"):

| Class | Text |
|---|---|
| `gx-card-name` | `${name}` |
| `gx-card-club` | `${club}`, or `${club} · now at ${clubNow}` |
| `gx-card-facts` | `Age ${age} · ${subPosition ?? positionGroup} · ${foot}-footed · ${heightCm} cm` (null parts omitted), or `Age ${age} · ${positionGroup} · no Transfermarkt record` |
| `gx-card-value` | `Market value ${money} (${date})`, `No 2024/25 valuation · older value ${money} (${date}, ${club})`, or `No 2024/25 valuation` |
| `gx-card-speed` | `Top speed ${psv99Kmh} km/h · faster than ${p}% of A-League ${groupPlural}` |
| `gx-card-sprint` | `Time to sprint ${timeToSprintS} s`, or `Time to sprint: position median (not measured)` |
| `gx-card-oop` | `Out of possession ${oopHiPerMin} m/min at high intensity · more than ${p}% of ${groupPlural}`, or `Out of possession: position median (not measured)` |
| `gx-card-runs` | `${offBallRunsPer30} off-ball runs per 30 min in possession (${runsInBehindPer30} in behind)` |
| `gx-card-passing` | `${p}% passes completed · ${lineBreakingPer30} line-breaking per 30 min` |
| `gx-card-national` | `${caps} caps, ${goals} goals for ${team}`, `${caps} international caps (may include youth caps) · citizenship ${citizenship}`, or `No international caps` |
| `gx-card-tournament` (one per tournament) | `${name} with ${team}: ${matches} matches, ${minutes} min · per 90: ${pressuresPer90} pressures, ${tacklesInterceptionsPer90} tackles + interceptions, ${recoveriesPer90} recoveries · ${p}% passes completed` |
| `gx-card-sources` | `SkillCorner (A-League Men 2024/25) · Transfermarkt · StatsBomb` |

- [ ] **Step 1: Write the failing tests:**
  - one full fixture player produces exactly the 12 expected lines in order;
  - variants: no Transfermarkt record; older valuation only; `filled: ["timeToSprint", "outOfPossession"]`;
    no caps; the listed national team; `clubNow`; €1,250,000 → "€1.3m" and €450,000 → "€450k";
  - a player without `scouting` → `[]`.
- [ ] **Step 2: Run** `node --test test/scouting-card.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement** `scoutingCardLines`, the dashboard block and its CSS, following the
  existing `.gx-panel` look and staying readable at 1366×768.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Check in the browser.** Start `python -m http.server 8764 --bind 127.0.0.1`, open
  each scenario and each candidate, and compare after Compare.
  - The card text matches `scouting-candidates.json`.
  - The runs differ as the report says.
  - The console shows only the favicon 404.
  - Take a screenshot.
- [ ] **Step 6: Commit** `git commit -m "feat(ui): scouting card with measured, market and national-team data"`.

### Task 10: Final verification and hand-off

- [ ] **Step 1: Run** `npm test`. Expected: every test passes; write down the count.
- [ ] **Step 2: Run** `node scripts/report-candidates.js` and keep the table for Fatih, including
  any clip where the candidates ran alike.
- [ ] **Step 3: Check that the app works offline.** Clone the branch into a scratch folder, then
  run `npm ci && npm run prepare:data` (Metrica needs the network once). Serve it and confirm with
  the browser's network log that every request goes to `127.0.0.1`.
- [ ] **Step 4: Hand off.** Report to Fatih: test count, report table, screenshots, the 12
  candidates, and anything the honesty check flagged. Merging into `main` waits for his OK.
