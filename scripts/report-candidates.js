// Per-clip report: how each real candidate's modeled run differs from the others.
// Usage (after npm run prepare:data): node scripts/report-candidates.js
import { readFile } from "node:fs/promises";
import { analyzeScenario, createPossessionValue } from "../src/analytics/decisionSupport.js";
import { attachCandidates } from "../src/data/scouting.js";
import { simulateAlternative } from "../src/simulation/alternative.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [raw, grid, scouting] = await Promise.all([
  read("../src/data/metrica-game1.json"), read("../src/data/fot/EPV_grid.csv"), read("../src/data/scouting-candidates.json"),
]);
const match = attachCandidates(JSON.parse(raw), JSON.parse(scouting));
const possessionValue = createPossessionValue(grid, match.pitch);

for (const moment of match.moments) {
  console.log(`\n${moment.id} (${moment.context})`);
  for (const candidateId of moment.candidatePlayerIds) {
    const player = match.players.find(({ id }) => id === candidateId);
    const simulation = simulateAlternative({ match, momentId: moment.id, candidateId });
    const analysis = analyzeScenario({ match, momentId: moment.id, simulation, possessionValue });
    const metric = (id) => analysis.metrics.find((entry) => entry.id === id);
    const first = simulation.engagedFrames.findIndex(Boolean);
    const share = simulation.engagedFrames.filter(Boolean).length / simulation.engagedFrames.length;
    console.log(`  ${player.scouting.pick.padEnd(15)} ${player.scouting.name.padEnd(18)} ${player.settings.topSpeed.toFixed(2)} m/s`
      + ` | ${first >= 0 ? `went for the ball at ${simulation.baselineFrames[first].time.toFixed(2)} s (${(100 * share).toFixed(0)}% of frames)` : "held position"}`
      + ` | closest ${metric("closest").alternative.toFixed(2)} m (recorded ${metric("closest").baseline.toFixed(2)})`
      + ` | to point ${metric("coverError").alternative.toFixed(2)} m | score ${analysis.recommendation.score}`);
  }
}
