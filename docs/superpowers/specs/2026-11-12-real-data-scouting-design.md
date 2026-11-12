# Real-data scouting candidates for GhostXI: design

Date: 2026-11-12 · Status: approved by Fatih (2026-11-12) · Vedad approved changes to his files

## Intent and why

GhostXI replays a real tracked clip (Metrica Sports sample data) and drops a "ghost" substitute
into it, to show how a different player would have handled the moment. Today the substitutes are
three invented profiles (Lane reader, Patient cover, Wide runner) with hand-picked settings.

We want the substitutes to be **real players**, and the algorithm that decides what the
substitute does in the clip should run on **their real data**: measured top speed and
acceleration, and how hard they work without the ball. The scouting side should show who the
player is and what he costs, so a cheap player who performs well stands out. This serves the
hackathon's "Find the Hidden Talent" challenge (a transparent player comparison that does not rely
only on goals or popularity) and the "Smart Coach" angle.

It stays an estimate of tendencies, not a prediction: the ball and the other 21 players keep their
recorded paths, exactly as today.

## Decisions already made (Fatih)

- **Stage:** the existing three Metrica Game 1 clips stay as they are.
- **Candidates:** real A-League Men 2024/25 players from SkillCorner's open season data, because
  SkillCorner is the only open dataset on the organisers' list that measures named players' speed.
- **Candidates per scenario:** 3–6, matched to the role of the player being replaced (4 in the shortlist below).
- **Top speed** from SkillCorner PSV-99.
- **Acceleration and reaction** from SkillCorner's time to reach sprint speed. Players without that
  measure get their position group's median.
- **How hard he goes for the ball** from his high-intensity running when his team does not have the ball.
- **Off-ball runs and passing go on the scouting card only.** They don't move the substitute. In the
  attack clip the support point stays 6 m ahead of the ball for every candidate, so the recorded
  player's numbers stay fixed and players who run in behind aren't marked down.
- **Re-tune and improve Vedad's movement model** so that real differences between candidates show
  up in their runs. As tuned today, the four transition-clip centre-backs run within 2 m of each
  other, and the fastest and the hidden talent within 10 cm.
- **Identity and context** from Transfermarkt: age, exact position, foot, height and market value,
  shown on a scouting card next to the performance numbers.
- **Matching** SkillCorner ↔ Transfermarkt players on name plus birthdate.
- **StatsBomb does not drive the scouting decision**: its open data has no A-League matches. It
  appears on the scouting card through national-team matches (see "National-team data").
- **National-team data:** besides the club, show national-team representation wherever data exists
  (added by Fatih after reviewing the design).
- **No EA/FIFA ratings** (video-game ratings, unclear licence).
- **Vedad approved** changes to his files (2026-11-12).

## Goals

1. Each of the three scenarios offers 4 real candidates of the right role.
2. The substitute's top speed, acceleration, reaction delay and engage range come from that
   candidate's SkillCorner numbers through simple, documented formulas.
3. The movement model uses speed and acceleration physically, so they change the run whenever the
   situation calls for running. The substitute decides between going for the ball and holding his
   position based on whether he can get there in time.
4. A scouting card shows the candidate's identity and context (Transfermarkt) next to his measured
   numbers (SkillCorner), plus his national-team record where it exists (Transfermarkt caps,
   StatsBomb tournament matches). Sources are named and any filled-in or outdated value is marked.
5. The existing comparison metrics and recommendation keep working; their wording no longer calls
   the candidates hypothetical.
6. Deterministic: the same scenario and candidate always produce the same run.
7. Works offline at demo time.

## Non-goals

- StatsBomb data in the scouting decision.
- Changing the Metrica stage, the ball path or the other 21 players.
- Measuring against a different point per candidate: the metrics' tactical points stay as today.
- A searchable scouting database or player-search screen.
- Predicting goals, outcomes or how the match would have ended.
- Agility beyond acceleration (no open source measures it).
- The synthetic module `src/data/demoMatch.js` (stays as is, unused by the app).

## Anti-goals (a failure even if it runs)

- Presenting a modeled run as what the real player would have done.
- **Tuning the model to manufacture differences.** Every difference between candidates must come
  from their measured numbers through the rules below.
- Showing a wrong Transfermarkt identity or an outdated market value as fact.
- Silently inventing numbers for missing data. Every filled-in value is marked on the card.
- Scoring or rewarding players for being young. Age is shown, never scored.
- Breaking the current demo or `npm test`.

## Data sources

| Source | Licence and credit | Download | What we use |
|---|---|---|---|
| SkillCorner Open Data, A-League Men 2024/25 season aggregates | MIT; credit SkillCorner | `https://raw.githubusercontent.com/SkillCorner/opendata/master/data/aggregates/aus1league_{physical,obr,passing}aggregates_20242025.csv` (3 CSVs, 0.5 MB) | `player_id`, `player_name`, `player_short_name`, `player_birthdate`, `team_name`, `position_group`, `minutes_full_all`, `count_match`, `psv99` (km/h), `timetosprint_top3` (s, missing for about half), high-intensity distance split in possession (`_tip`) and out of possession (`_otip`), off-ball runs and passing per 30 min in possession |
| Transfermarkt datasets (dcaribou/transfermarkt-datasets) | CC0; name it anyway | `https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz` (4.2 MB), `.../player_valuations.csv.gz` (6.9 MB) and `.../national_teams.csv.gz` (small) | `name`, `date_of_birth`, `position`, `sub_position`, `foot`, `height_in_cm`, `current_club_name`, market value history, `international_caps`, `international_goals`, `current_national_team_id` → national team name and FIFA ranking. Covers the A-League Men (competition `AUS1`) |
| StatsBomb Open Data, men's international tournaments | Free; credit StatsBomb and show its logo when published | `https://raw.githubusercontent.com/statsbomb/open-data/master/data/{matches,lineups,events}/…` (lineups are about 28 KB per match; events about 3.5 MB per match, fetched only for matches a candidate played) | World Cups 2018 and 2022, Euro 2020 and 2024, Copa América 2024, AFCON 2023: who played, minutes, and per-match events |
| Metrica Sports sample data, Game 1 | Free sample; credit Metrica | unchanged (`npm run prepare:data`) | The stage: tracking clips, unchanged |

Shape of the SkillCorner files: one row per player **per position group** (406 rows, 268
players); three players also have separate rows per club. `minutes_full_all` is the average
minutes per counted match (60+ minute performances only), not a season total.

Observed: PSV-99 ranges from 26.7–32.3 km/h for Full Backs (median 29.0), 25.8–30.9 for Central
Defenders (28.1), 26.0–31.9 for Wide Attackers (28.6). Time to sprint is 1.1–2.0 s (median about 1.4).

The organisers ask teams to name every source on the final slide.

## The improved movement model (my call)

`simulateAlternative` in `src/simulation/alternative.js` keeps its signature and output shape.

**What stays:**
- the recorded ball and other 21 players;
- the substitute's start position and velocity (the recorded player's);
- the tactical points, the cue (when the action starts) and the action end;
- the metrics' measuring points (the attack support point stays 6 m ahead of the ball);
- 25 Hz frames and determinism.

**What changes:**

1. **Moving like a sprinter, not on a spring.** Today the substitute's desired speed is 3 × his
   distance to the target, capped at top speed. Within about 2–3 m of the target his top speed
   never matters. Replace this with an arrive rule: accelerate at his acceleration up to his top
   speed, and brake only as much as needed to stop at the target (speed ≤ √(2 × braking ×
   distance), braking = his acceleration). Speed then matters whenever there is ground to cover,
   and acceleration matters for short bursts.
2. **Deciding whether to go for the ball.** After the cue plus his reaction delay, each frame he
   checks whether he can reach the ball's path in time:
   - project the ball forward from its two latest positions (as today, but over the next 1.5 s
     instead of 0.24 s);
   - find the earliest point on that path he could reach before the ball does, given his reaction,
     acceleration and top speed;
   - go for it if it lies within his **engage range** of the tactical point. Otherwise he holds or
     recovers to the tactical point.

   This uses only what a player could see at that moment, never the recorded future.
3. **Engage range** replaces today's step-out: how far from his tactical point he is willing to go
   to meet the ball.

| Setting | SkillCorner source | Mapping |
|---|---|---|
| Top speed | PSV-99 | km/h ÷ 3.6 (about 6.8–9.0 m/s) |
| Acceleration and braking | time to sprint | percentile within the position group, mapped onto 4.0–6.0 m/s² (quicker = higher). If SkillCorner's glossary gives the starting speed for "time to sprint", compute it directly instead |
| Reaction delay | time to sprint | same percentile, mapped onto 0.48–0.16 s (quicker = shorter) |
| Engage range | high-intensity distance per minute out of possession | percentile within the group, mapped onto 3–9 m |

- **Percentiles** are computed against every player of the same SkillCorner position group, so the
  card can say "faster than 80% of A-League full-backs".
- **Missing time to sprint** → the group median, marked "position median" on the card.
- **Initial ranges** may be re-tuned against the clips, but only to keep movement physically
  realistic, never to widen gaps between candidates.

## Candidate shortlist (my call)

Roles of the replaced players, inferred from their positions relative to teammates in the Metrica clips:

| Scenario (Metrica) | Replaced player | Role | SkillCorner group |
|---|---|---|---|
| `home-wide-interception` (transition) | Home 2 | right centre-back covering wide | Central Defender |
| `home-defensive-press` (press) | Home 1 | right-back | Full Back |
| `home-deep-pass-attack` (attack) | Home 8 | left-sided forward | Wide Attacker |

**Eligibility:** use the player's row for that position group; if he has two (changed club), the
one with more matches. He needs **at least 900 minutes in that position**, counted as
`minutes_full_all × count_match`.

**Picks**, 4 per scenario from the eligible players:

1. the fastest (highest PSV-99);
2. the hardest worker without the ball (highest high-intensity distance per minute out of possession);
3. the quickest to sprint speed (lowest time to sprint, among players who have it);
4. the **hidden talent**: the best average of those three percentiles among players whose 2024/25
   market value is strictly below the median of the eligible players who have one.

**Tie and duplicate rules:**
- No player twice across all 12 picks. Scenarios fill in order (transition, press, attack), and
  the next best fills any gap.
- Ties are broken by SkillCorner `player_id`.
- A player without a Transfermarkt match or a 2024/25 value can still be picked for 1–3, but not
  as the hidden talent.

## Market value, age and club (my call)

- **Market value:** a valuation counts as 2024/25 only if dated 2024-07-01 to 2025-06-30, and the
  last one in that window is used. Otherwise the card says "no 2024/25 valuation" and shows the
  latest older value, its date and its club, marked as older.
- **Age:** from birthdate, at 2025-06-30.
- **Club:** show the SkillCorner 2024/25 club, where his numbers come from. If Transfermarkt's
  current club differs, add "now at <club>".

## National-team data (Fatih's request; details are my call)

- **Transfermarkt (every candidate):** international caps and goals, plus the current national team
  when one is listed (`current_national_team_id` → `national_teams.csv.gz`).
  - 59 of the 76 eligible players have caps, e.g. Aziz Behich 87 for Australia, Hiroki Sakai 74 for
    Japan, Tommy Smith 56 for New Zealand.
  - Transfermarkt's caps belong to the last national team a player represented, which can be a
    youth side. The card therefore says "may include youth caps", unless the listed current
    national team is a senior team in `national_teams`.
  - Most capped players have no current national team listed. The card then shows citizenship
    rather than guessing which team the caps came from.
- **StatsBomb (where it exists):** the men's international tournaments in the open data are the
  World Cups 2018 and 2022, Euro 2020 and 2024, Copa América 2024 and AFCON 2023.
  - Look for each eligible player in the lineups of his country's matches, matching names only
    within that country's squad and checking each match by hand.
  - For each tournament he played, show from the events: matches, minutes, pressures, tackles plus
    interceptions and ball recoveries per 90, and pass completion.
  - A first check found six eligible candidates:

    | Player | Country | Tournaments in StatsBomb |
    |---|---|---|
    | Aziz Behich | Australia | World Cups 2018 and 2022 |
    | Hiroki Sakai | Japan | World Cups 2018 and 2022 |
    | Josh Risdon | Australia | World Cup 2018 |
    | Nathaniel Atkinson | Australia | World Cup 2022 |
    | Trent Sainsbury | Australia | World Cup 2018 |
    | Daniel Arzani | Australia | World Cup 2018 |
- **Shown on the card, not used by the movement model or the picks.** Only a handful of players
  have tournament data, it comes from 2018–2024, and caps can include youth caps, so it can't be
  compared fairly across candidates.
- **Downloads:** StatsBomb lineups for those tournaments are small. Events are fetched only for
  matches a candidate played: about 13 matches, about 45 MB, once. Transfermarkt's `appearances`
  file (43 MB) is skipped; it would add tournament counts such as the Asian Cup, but caps already
  cover national-team experience.
- **Credit:** StatsBomb asks for its logo when results are published. Put it on the final slide and
  next to the tournament line on the card.

## Data pipeline (my call)

- New script `scripts/prepare-scouting.js` (Node, no new dependencies). It downloads the 3
  SkillCorner CSVs, the Transfermarkt files and the StatsBomb lineups and events above (about 60 MB
  in total, once), matches players, picks the shortlist, computes the settings, and writes
  `src/data/scouting-candidates.json`.
- That JSON is small and both licences allow redistribution (SkillCorner MIT with its notice,
  Transfermarkt CC0), so it is **committed**, with SkillCorner's licence next to it. The app then
  works offline without running the script. (The Metrica clip stays gitignored as today.)
- **Name matching:** exact birthdate plus a normalised name (accents and case removed), trying full
  name, then short name, then last name plus first initial. Two possible matches → no match.
- **No invented 0–100 traits** for real candidates. Nothing in the app needs them once settings come
  from measurements; the card shows measured numbers and percentiles instead.

## Showing it

- **Candidate menu:** real name and 2024/25 club, e.g. "Name (Club)".
- **Scouting card** in the analysis panel:
  - Identity: name, club ("now at …" if moved), age, Transfermarkt position, foot, height, market
    value and its date.
  - Measured: top speed in km/h with percentile, time to sprint, out-of-possession intensity,
    off-ball runs, passing.
  - National team: caps and goals ("may include youth caps"), current national team or
    citizenship, and StatsBomb tournament lines where they exist.
  - Marks on filled-in or older values; sources line "SkillCorner (A-League Men 2024/25) ·
    Transfermarkt · StatsBomb", with StatsBomb's logo next to tournament data.
- **Wording:** replace "The candidate profiles are hypothetical" with: the candidate's settings come
  from his 2024/25 A-League measurements; the run itself is still a modeled estimate in a different
  match. The recommendation may cite the measured numbers and say when he went for the ball and why.

## Constraints

- **Ownership:** Vedad approved changes to his files (2026-11-12):
  - `alternative.js` (improved model, settings read from the candidate data);
  - `main.js` (load the candidates);
  - `prepare-data.js` (candidate ids per scenario);
  - `decisionSupport.js` (wording);
  - `dashboard.js` and `ui.css` (scouting card);
  - his test `test/tracked-scenario.test.js`, re-pinned to the improved model.

  Keep his function signatures.
- Keep `npm ci`, `npm run prepare:data` and the static server flow working; `npm test` green.
- No new npm dependencies; the browser side stays plain JavaScript.
- Deterministic, no randomness.
- Small downloads only (the organisers warn about the venue Wi-Fi).

## How we'll know it works

- **Per-clip report:** a script reports, for each clip, how the four candidates' runs differ:
  closest approach to the ball, distance to the tactical point, and whether and when each went for
  the ball. Candidates who are faster, react quicker or work harder without the ball should go for
  a reachable ball earlier or more often. If a clip still shows near-identical runs, the report
  says so with the numbers instead of inflating the model.
- Each card shows the right Transfermarkt identity and national-team record, and any StatsBomb
  tournament line belongs to the right player (spot-checked by hand for all 12 candidates).
- The demo runs offline from a fresh clone after `npm ci && npm run prepare:data`.
- `npm test` passes, including new tests for:
  - shortlist rules, formulas, name matching and the valuation window;
  - model behaviour, e.g. a faster candidate never reaches a reachable ball later than a slower one;
  - determinism.

## Left to the builder

- File, function and field names, and the exact shape of `scouting-candidates.json`.
- Card layout and styling within the existing dashboard look.
- How the settings reach `simulateAlternative` (keep its signature).
- Reading SkillCorner's physical-data glossary for the exact definitions of PSV-99, time to sprint
  and the in/out-of-possession splits, and adjusting labels to match.
- Test design, and the projection horizon (1.5 s) if the clips show a better value for realism.
