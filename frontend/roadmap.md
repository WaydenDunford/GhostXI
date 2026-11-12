# Multi-sport expansion roadmap

- [x] Sport config system (`src/lib/sports.ts`): 5 sports, terminology, clocks, surfaces, data sources
- [x] Per-sport datasets (`src/lib/sport-data.ts`): football = existing mock-data; basketball, hockey, handball, volleyball = clearly labeled demo data
- [x] Sport context + selector in top nav (`src/lib/sport-context.tsx`, app-shell)
- [x] Generic simulation field + sport surfaces (`field.tsx`, refactored `pitch.tsx`)
- [x] Surface color tokens in styles.css
- [x] Wire pages to active sport: Dashboard, Match Lab, Momentum, Scouting, Smart Coach, Reports, Settings
- [x] Verify all 5 sports end-to-end in browser; typecheck; commit

# Bosnia national-team multi-ghost expansion (REMOVED — data not accurate)

- [x] Bosnia–Poland module (`src/lib/bosnia-match.ts`): verified match facts, 4-4-2 lineups, ghost candidates, provenance-labeled moments
- [x] Multi-ghost replacement validation (no duplicate originals/candidates) + 4 branch lineups with exactly 11 players each
- [x] Deterministic demo simulation adapter: 4 branch metrics, partnership analysis, Smart Coach insights, scouting reports with Team Fit Score
- [x] Multi original/ghost rendering in `field.tsx` (pairId-matched deltas and trails)
- [x] Ghost Lineup Builder + branch selector + Recommended Moments + Partnership Analysis + Scouting Report in `bosnia-lab.tsx`
- [x] Match Lab routes football → BosniaLab, other sports → generic lab
- [x] Verify in browser (acceptance flow), run tests + typecheck, commit

# Real match data (World Cup 2022)

- [x] Catalog client + Match Lab "Verified match catalog" and "Data source" panels with honest empty state
- [ ] Real tracking replay, real moments, candidates — blocked: needs the data backend (VITE_GHOSTXI_API_URL) with PFF FC files imported
