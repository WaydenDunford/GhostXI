import { mountDashboard } from "./ui/dashboard.js";
import { replacementProfiles, simulateAlternative } from "./simulation/alternative.js";
import { analyzeScenario, buildMomentum, createPossessionValue } from "./analytics/decisionSupport.js";

const root = document.querySelector("#app");

async function load(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  return response;
}

try {
  const [recording, grid] = await Promise.all([
    load("./data/metrica-game1.json").then((response) => response.json()),
    load("./data/fot/EPV_grid.csv").then((response) => response.text()),
  ]);
  if (!recording.moments.every(({ action }) => action)) {
    throw new Error("The local Metrica cache needs to be refreshed for the expanded scenarios.");
  }
  const possessionValue = createPossessionValue(grid, recording.pitch);
  const match = {
    ...recording,
    players: [...recording.players, ...replacementProfiles],
    momentum: buildMomentum(recording, possessionValue),
  };
  root.replaceChildren();
  startDashboard(match, possessionValue);
} catch (error) {
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = `GhostXI could not load the tracked demo. Run npm ci and npm run prepare:data from the project folder, then reload. ${error.message}`;
  root.replaceChildren(message);
}

function startDashboard(match, possessionValue) {
  let moment = match.moments[0];
  let candidateId = moment.candidatePlayerIds[0];
  let elapsed = 0;
  let previousTimestamp;
  let request;
  let playing = false;
  let simulation = null;
  let analysis = null;

  const dashboard = mountDashboard(root, {
    match,
    onMomentChange(momentId) {
      moment = match.moments.find(({ id }) => id === momentId);
      candidateId = moment.candidatePlayerIds[0];
      clearComparison();
      reset();
    },
    onCandidateChange(nextCandidate) {
      candidateId = nextCandidate;
      clearComparison();
      render();
    },
    onCompare() {
      if (simulation) clearComparison();
      else {
        const momentId = moment.id;
        simulation = simulateAlternative({ match, momentId, candidateId });
        analysis = analyzeScenario({ match, momentId, simulation, possessionValue });
      }
      render();
    },
    onSeek(progress) {
      elapsed = progress * moment.durationSec;
      previousTimestamp = undefined;
      if (elapsed >= moment.durationSec) stop();
      render();
    },
    onPlayPause() {
      if (playing) stop();
      else {
        if (elapsed >= moment.durationSec) elapsed = 0;
        playing = true;
        previousTimestamp = undefined;
        request = requestAnimationFrame(tick);
      }
      render();
    },
    onReset: reset,
  });

  function clearComparison() {
    simulation = null;
    analysis = null;
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(request);
  }

  function reset() {
    stop();
    elapsed = 0;
    render();
  }

  function tick(timestamp) {
    elapsed = Math.min(moment.durationSec, elapsed + (timestamp - (previousTimestamp ?? timestamp)) / 1000);
    previousTimestamp = timestamp;
    if (elapsed >= moment.durationSec) stop();
    render();
    if (playing) request = requestAnimationFrame(tick);
  }

  function render() {
    const progress = elapsed / moment.durationSec;
    const frameIndex = Math.round(progress * (moment.frames.length - 1));
    const baselineFrame = moment.frames[frameIndex];
    const { startFrame, endFrame, phases } = moment.action;
    const phase = baselineFrame.sourceFrame >= endFrame ? 2 : Number(baselineFrame.sourceFrame >= startFrame);
    const status = `Recorded event · ${phases[phase]}`;
    dashboard.update({ momentId: moment.id, candidateId, progress, playing, baselineFrame,
      alternativeFrame: simulation?.alternativeFrames[frameIndex], coverPoint: simulation?.tacticalPoints[frameIndex],
      analysis, compared: Boolean(simulation), status });
  }

  render();
}
