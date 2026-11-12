import { createSelector } from "./dashboard.js";
import { createPitch } from "./pitch.js";
import { frameAtTime, createReplayClock } from "../replay/controller.js";

export async function mountVerifiedDashboard(root, api) {
  const [matches, registry] = await Promise.all([api.getReplayMatches(), api.getDatasetStatus()]);
  const events = new AbortController(), { signal } = events;
  root.innerHTML = `<div class="ghostxi gx-verified">
    <header class="gx-header"><h1 class="gx-brand">Ghost<span>XI</span></h1><p class="gx-notice">VERIFIED SOURCE REPLAY · SIMULATED ALTERNATIVES</p></header>
    <div class="gx-controls"><div class="gx-match-selector"></div><div class="gx-moment-selector"></div><div class="gx-player-selector"></div></div>
    <section class="gx-panel"><h2>Counterfactual replacements</h2><p>Verified identities; shared modeled movement parameters. Candidate profiles are independent of anonymous historical players.</p>
      <div class="gx-candidate-rows"></div><button class="gx-button gx-add" type="button">Add replacement</button><button class="gx-button gx-run" type="button">Save & simulate branches</button></section>
    <div class="gx-controls"><button class="gx-button gx-play" type="button">Play</button><button class="gx-button gx-reset" type="button">Reset</button>
      <input class="gx-seek" type="range" min="0" max="8" step=".04" value="0" aria-label="Replay time"><span class="gx-time"></span>
      <div class="gx-speed-selector"></div><div class="gx-branch-selector"></div></div>
    <div class="gx-workspace"><section class="gx-panel"><h2>Historical original</h2><p class="gx-source-label"></p><div class="gx-pitch"><canvas class="gx-original" role="img" aria-label="Historical source replay"></canvas></div></section>
      <section class="gx-panel"><h2>Simulated alternative</h2><p class="gx-alternative-label">Choose replacements and run a simulation.</p><div class="gx-pitch"><canvas class="gx-alternative" role="img" aria-label="Simulated alternative replay"></canvas></div></section></div>
    <p class="gx-status" role="status"></p><section class="gx-panel"><h2>Smart Coach & scouting</h2><div class="gx-coach"></div></section>
    <section class="gx-panel"><h2>Saved comparisons</h2><div class="gx-saved"></div></section>
    <section class="gx-panel"><h2>Dataset availability</h2><ul class="gx-datasets"></ul></section></div>`;
  const find = (s) => root.querySelector(s), selectors = {};
  const status = (value) => { find(".gx-status").textContent = value; };
  const safe = (fn) => (...args) => Promise.resolve().then(() => fn(...args)).catch((e) => status(e.message));
  function add(parent, tag, value) { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; }
  function select(container, key, label, fn) { return createSelector(container, `verified-${key}`, label, "Unavailable", safe(fn), signal); }
  for (const row of registry.providers) add(find(".gx-datasets"), "li", `${row.provider} · ${row.matchIdentifier ?? "no imported match"} · ${row.playable ? "playable tracking windows" : row.validationStatus}`);
  if (registry.providers.some((p) => p.provider === "statsbomb")) {
    const credit = add(find(".gx-datasets").parentElement, "p", "Player event data: ");
    const link = add(credit, "a", "StatsBomb Open Data"); link.href = "https://github.com/hudl/open-data"; link.rel = "noopener";
    const logo = document.createElement("img"); logo.src = new URL("datasets/statsbomb/logo", apiBase()).href;
    logo.alt = "StatsBomb"; logo.height = 24; logo.style.marginLeft = "12px"; credit.append(logo);
  }
  let match, moments = [], moment, playerId, tracking = [], result, branch, rows = [], clock, originalPitch, alternativePitch, generation = 0;
  selectors.match = select(find(".gx-match-selector"), "match", "Verified match", loadMatch);
  selectors.moment = select(find(".gx-moment-selector"), "moment", "Historical moment", loadMoment);
  selectors.player = select(find(".gx-player-selector"), "player", "Player under review", async (id) => {
    playerId = id; selectors.player.setValue(id); await loadMoments();
  });
  selectors.speed = select(find(".gx-speed-selector"), "speed", "Playback speed", (id) => { clock?.setSpeed(Number(id)); selectors.speed.setValue(id); });
  selectors.speed.setOptions([.5, 1, 2, 4].map((n) => ({ id: String(n), label: `${n}×` }))); selectors.speed.setValue("1");
  selectors.branch = select(find(".gx-branch-selector"), "branch", "Alternative branch", (id) => { branch = result.branches.find((b) => b.id === id); selectors.branch.setValue(id); clock?.seek(0); });
  selectors.branch.setOptions([]);
  async function loadMatch(id) {
    const token = ++generation, next = await api.getReplayMatch(id); if (token !== generation) return;
    clock?.destroy(); match = next; selectors.match.setValue(id); originalPitch?.destroy(); alternativePitch?.destroy();
    const pitchMatch = { pitch: match.pitch, players: match.players.map((p) => ({ ...p, team: p.teamId === match.teams[0].id ? "HOME" : "AWAY" })) };
    originalPitch = createPitch(find(".gx-original"), pitchMatch); alternativePitch = createPitch(find(".gx-alternative"), pitchMatch);
    const starters = match.players.filter((p) => p.isStarter !== false);
    selectors.player.setOptions(starters.map((p) => ({ id: p.id, label: `${p.name} · ${p.position ?? "role unknown"}` })));
    playerId = starters.find((p) => p.id === "Player2")?.id ?? starters[0]?.id; selectors.player.setValue(playerId); await loadMoments();
  }
  async function loadMoments() {
    moments = await api.getRecommendedMoments(match.id, { playerId, limit: 5 });
    selectors.moment.setOptions(moments.map((m) => ({ id: m.id, label: m.title })));
    if (moments.length) await loadMoment(moments[0].id);
    else { clock?.destroy(); tracking = []; result = null; status("Tracking exists, but synchronized semantic event scenarios are unavailable. Raw tracking is available through the API."); }
  }
  async function loadMoment(id) {
    clock?.destroy(); const token = ++generation;
    const payload = await api.getReplayTracking(match.id, { momentId: id, limit: 2000 }); if (token !== generation) return;
    if (!payload.frames.length || new Set(payload.frames.map((f) => f.period)).size !== 1) throw new Error("Expected a single-period source tracking window.");
    tracking = payload.frames; moment = moments.find((m) => m.id === id); result = null; branch = null;
    selectors.moment.setValue(id); selectors.branch.setOptions([]); rows = []; find(".gx-candidate-rows").replaceChildren(); await addRow(playerId);
    const durationSec = tracking.at(-1).periodTimeSec - tracking[0].periodTimeSec; find(".gx-seek").max = String(durationSec);
    find(".gx-source-label").textContent = `${tracking[0].dataStatus} · ${match.source.name} · ${tracking.length} source frames · no interpolation`;
    find(".gx-alternative-label").textContent = "Choose replacements and run a simulation.";
    clock = createReplayClock({ durationSec, onTime: render, requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame });
    selectors.speed.setValue("1"); render(0, false); await refreshSaved();
  }
  async function addRow(originalId, desiredCandidateId) {
    if (rows.length >= 4) return;
    const active = Object.keys(tracking[0].players).filter((id) => tracking[0].players[id]);
    originalId ??= active.find((id) => !rows.some((r) => r.originalPlayerId === id) && match.players.find((p) => p.id === id)?.teamId === match.players.find((p) => p.id === (rows[0]?.originalPlayerId ?? playerId))?.teamId);
    if (!originalId) return;
    const row = { originalPlayerId: originalId, candidatePlayerId: null }; rows.push(row);
    const container = add(find(".gx-candidate-rows"), "div", ""); container.className = "gx-controls";
    const outgoing = add(container, "div", ""), incoming = add(container, "div", ""), key = crypto.randomUUID();
    const candidateSelect = select(incoming, `incoming-${key}`, "Verified candidate", (id) => { row.candidatePlayerId = id; candidateSelect.setValue(id); });
    const outgoingSelect = select(outgoing, `outgoing-${key}`, "Outgoing source player", updateCandidates);
    outgoingSelect.setOptions(match.players.filter((p) => active.includes(p.id)).map((p) => ({ id: p.id, label: p.name })));
    async function updateCandidates(id) {
      row.originalPlayerId = id; outgoingSelect.setValue(id);
      const candidates = await api.getReplacementCandidates({ matchId: match.id, replacePlayerId: id });
      candidateSelect.setOptions(candidates.map((p) => ({ id: p.id, label: `${p.name} · ${p.position} · ${p.source}` })));
      row.candidatePlayerId = candidates.find((p) => !rows.some((r) => r !== row && r.candidatePlayerId === p.id))?.id; candidateSelect.setValue(row.candidatePlayerId);
    }
    const remove = add(container, "button", "Remove"); remove.type = "button"; remove.className = "gx-button";
    remove.addEventListener("click", () => { rows = rows.filter((r) => r !== row); container.remove(); }, { signal }); await updateCandidates(originalId);
    if (desiredCandidateId) { row.candidatePlayerId = desiredCandidateId; candidateSelect.setValue(desiredCandidateId); }
  }
  function displayFrame(frame) {
    if (!frame) return null;
    const convert = (p) => p ? { x: p.x / 100 * match.pitch.length, y: p.y / 100 * match.pitch.width } : null;
    return { ball: convert(frame.ball), players: Object.fromEntries(Object.entries(frame.players).map(([id, p]) => [id, convert(p)])) };
  }
  function render(time, playing) {
    const sourceFrame = frameAtTime(tracking, (tracking[0]?.periodTimeSec ?? 0) + time, match.fps), alternative = branch ? frameAtTime(branch.frames, time, match.fps) : null;
    originalPitch.render({ frame: displayFrame(sourceFrame), highlightedId: playerId });
    alternativePitch.render({ frame: displayFrame(alternative), highlightedId: rows[0]?.candidatePlayerId });
    find(".gx-seek").value = String(time); find(".gx-play").textContent = playing ? "Pause" : "Play";
    find(".gx-time").textContent = `${time.toFixed(2)} s · period ${sourceFrame?.period ?? "gap"} · source frame ${sourceFrame?.sourceFrame ?? "missing"}`;
    if (!sourceFrame) status("No source observation at this time; tracking gaps are not interpolated.");
  }
  async function showResult(id) {
    clock.pause(); result = await api.simulateSavedScenario(id); branch = result.branches.at(-1);
    selectors.branch.setOptions(result.branches.map((b) => ({ id: b.id, label: b.id === "combined" ? "Combined (independent joint run)" : b.id }))); selectors.branch.setValue(branch.id);
    find(".gx-alternative-label").textContent = `SIMULATED · ${branch.replacements.length} replacement(s) · modeled physical parameters`;
    const coaching = find(".gx-coach"); coaching.replaceChildren();
    for (const b of result.branches) add(coaching, "p", `${b.id}: geometric role proxy ${b.metrics.originalValue} → ${b.metrics.alternativeValue}; delta ${b.metrics.delta}.`);
    for (const f of result.findings) add(coaching, "p", `${f.branchId} · ${f.interpretation} ${f.suggestedInvestigation}`);
    const assumptions = add(coaching, "details", ""); add(assumptions, "summary", "Model assumptions and limitations");
    for (const line of result.limitations) add(assumptions, "p", line);
    for (const candidateId of new Set(result.branches.flatMap((b) => b.replacements.map((r) => r.candidatePlayerId)))) {
      const assessment = await api.getCandidateAssessment({ candidateId, matchId: match.id });
      add(coaching, "p", `${candidateId}: ${assessment.overallScore ?? "role-specific"}/100 · ${assessment.groups[0].category} · low confidence; gather more evidence.`);
    }
    status("Saved scenario complete. Original source frames remain unchanged."); clock.seek(0); await refreshSaved();
  }
  async function refreshSaved() {
    const saved = await api.listSavedScenarios({ matchId: match.id }), container = find(".gx-saved"); container.replaceChildren();
    for (const s of saved) {
      const button = add(container, "button", `${s.momentId} · ${(s.replacements ?? [s]).length} replacement(s)`); button.className = "gx-button";
      button.addEventListener("click", safe(async () => {
        if (s.momentId !== moment.id) await loadMoment(s.momentId);
        rows = []; find(".gx-candidate-rows").replaceChildren();
        for (const r of s.replacements ?? [s]) await addRow(r.originalPlayerId, r.candidatePlayerId);
        await showResult(s.id);
      }), { signal });
    }
    if (!saved.length) add(container, "p", "No saved verified tracking scenarios yet.");
  }
  find(".gx-add").addEventListener("click", safe(() => addRow()), { signal });
  find(".gx-run").addEventListener("click", safe(async () => {
    const button = find(".gx-run"); button.disabled = true;
    try { const scenario = await api.createSavedScenario({ sportId: "football", matchId: match.id, momentId: moment.id, seed: 42, replacements: rows.map((r) => ({ ...r })) }); await showResult(scenario.id); }
    finally { button.disabled = false; }
  }), { signal });
  find(".gx-play").addEventListener("click", () => clock && (clock.playing ? clock.pause() : clock.play()), { signal });
  find(".gx-reset").addEventListener("click", () => { clock?.pause(); clock?.seek(0); }, { signal });
  find(".gx-seek").addEventListener("input", (e) => clock?.seek(Number(e.target.value)), { signal });
  selectors.match.setOptions(matches.map((m) => ({ id: m.id, label: m.name })));
  if (matches.length) await loadMatch(matches[0].id); else status("No verified historical replay match is available. Inspect dataset status and import source files.");
  return { destroy() { events.abort(); clock?.destroy(); originalPitch?.destroy(); alternativePitch?.destroy(); root.replaceChildren(); } };
}

function apiBase() {
  return (new URLSearchParams(location.search).get("api") ?? `${location.origin}/api/v1`).replace(/\/+$/, "") + "/";
}
