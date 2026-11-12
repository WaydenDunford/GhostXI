import { createPitch } from "./pitch.js";

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const deltaFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
let dashboardCount = 0;

export function mountDashboard(root, {
  match, onMomentChange, onCandidateChange, onCompare, onSeek, onPlayPause, onReset,
}) {
  const doc = root.ownerDocument;
  const prefix = `ghostxi-${++dashboardCount}`;
  const events = new doc.defaultView.AbortController();
  const { signal } = events;
  const shell = doc.createElement("div");
  shell.className = "ghostxi";
  shell.innerHTML = `
    <header class="gx-header">
      <h1 class="gx-brand"><span class="gx-mark" aria-hidden="true"></span>Ghost<span>XI</span></h1>
      <p class="gx-notice">SYNTHETIC DATA — HEURISTIC SCENARIO, NOT A PREDICTION</p>
    </header>
    <div class="gx-controls">
      <div class="gx-moment"></div>
      <div class="gx-candidate"></div>
      <button class="gx-button gx-compare" type="button">Compare players</button>
    </div>
    <div class="gx-workspace">
      <section class="gx-panel gx-replay" aria-labelledby="${prefix}-replay">
        <header class="gx-panel-header">
          <div>
            <h2 id="${prefix}-replay">2D replay</h2>
            <p class="gx-match"></p>
          </div>
          <span class="gx-mode">Original</span>
        </header>
        <p class="gx-description" hidden></p>
        <div class="gx-pitch">
          <canvas role="img" aria-label="Football pitch"></canvas>
        </div>
        <div class="gx-transport">
          <button class="gx-button gx-play" type="button">Play</button>
          <button class="gx-button gx-reset" type="button">Reset</button>
          <input class="gx-seek" type="range" min="0" max="1" step="any" value="0" aria-label="Replay position">
          <span class="gx-time" aria-hidden="true"></span>
        </div>
        <ul class="gx-legend" aria-label="Pitch legend">
          <li><span class="gx-dot gx-home" aria-hidden="true"></span>Home</li>
          <li><span class="gx-dot gx-away" aria-hidden="true"></span>Away</li>
          <li><span class="gx-dot gx-ball" aria-hidden="true"></span>Ball</li>
          <li><span class="gx-dot gx-replacement" aria-hidden="true"></span>Replacement</li>
          <li><span class="gx-dot gx-ghost" aria-hidden="true"></span>Original player (ghost)</li>
        </ul>
        <p class="gx-status" role="status" hidden></p>
      </section>
      <section class="gx-panel gx-analysis" aria-labelledby="${prefix}-analysis">
        <header class="gx-panel-header">
          <h2 id="${prefix}-analysis">Coaching &amp; scouting</h2>
        </header>
        <div class="gx-results"></div>
      </section>
    </div>`;
  root.append(shell);

  const find = (selector) => shell.querySelector(selector);
  const momentSelect = createSelector(find(".gx-moment"), `${prefix}-moment`,
    "Match situation", "No situations available", onMomentChange, signal);
  const candidateSelect = createSelector(find(".gx-candidate"), `${prefix}-candidate`,
    "Replacement", "No replacements available", onCandidateChange, signal);
  const compare = find(".gx-compare");
  const play = find(".gx-play");
  const reset = find(".gx-reset");
  const seek = find(".gx-seek");
  const time = find(".gx-time");
  const mode = find(".gx-mode");
  const description = find(".gx-description");
  const matchLabel = find(".gx-match");
  const status = find(".gx-status");
  const results = find(".gx-results");
  const canvas = find("canvas");
  const pitch = createPitch(canvas, match);
  const moments = new Map(match.moments.map((moment) => [moment.id, moment]));
  const players = new Map(match.players.map((player) => [player.id, player]));
  let currentMoment;
  let currentAnalysis;

  compare.addEventListener("click", () => onCompare(), { signal });
  play.addEventListener("click", () => onPlayPause(), { signal });
  reset.addEventListener("click", () => onReset(), { signal });
  seek.addEventListener("input", () => onSeek(seek.valueAsNumber), { signal });
  momentSelect.setOptions(match.moments.map(({ id, title }) => ({ id, label: title })));

  function update(viewModel) {
    const { momentId, candidateId, progress, playing, baselineFrame, alternativeFrame,
      analysis, compared, status: statusText } = viewModel;
    const moment = moments.get(momentId);
    const outgoingId = moment?.targetPlayerId;
    const comparisonVisible = Boolean(compared && alternativeFrame);
    const duration = moment?.durationSec ?? 0;
    const elapsed = `${(progress * duration).toFixed(1)} s of ${numberFormat.format(duration)} s`;

    if (moment !== currentMoment) {
      const candidates = (moment?.candidatePlayerIds ?? [])
        .map((id) => players.get(id))
        .filter(Boolean)
        .map(({ id, displayName }) => ({ id, label: displayName }));
      candidateSelect.setOptions(candidates);
      currentMoment = moment;
    }
    momentSelect.setValue(momentId);
    candidateSelect.setValue(candidateId);
    compare.disabled = !moment?.candidatePlayerIds.includes(candidateId) || !players.has(candidateId);
    play.disabled = !moment;
    reset.disabled = !moment;
    seek.disabled = !moment;
    setText(play, playing ? "Pause" : "Play");
    seek.value = progress;
    seek.setAttribute("aria-valuetext", elapsed);
    setText(time, elapsed);
    setText(mode, comparisonVisible ? "Alternative + ghost" : "Original");
    mode.classList.toggle("gx-mode-compared", comparisonVisible);
    setText(matchLabel, [match.name, moment?.startClock].filter(Boolean).join(" · "));
    setOptionalText(description, moment?.description);
    setOptionalText(status, statusText);

    const frame = comparisonVisible ? alternativeFrame : baselineFrame;
    const ghostPosition = comparisonVisible ? baselineFrame?.players[outgoingId] : undefined;
    const pitchLabel = frame ? `Football pitch with ${Object.keys(frame.players).length} players and the ball` : "Football pitch";
    canvas.setAttribute("aria-label", ghostPosition ? `${pitchLabel}, plus the original player’s ghost` : pitchLabel);
    pitch.render({ frame, ghostPosition, outgoingId, incomingId: comparisonVisible ? candidateId : undefined });

    const visibleAnalysis = compared ? analysis ?? null : null;
    if (visibleAnalysis !== currentAnalysis) {
      renderAnalysis(results, visibleAnalysis);
      currentAnalysis = visibleAnalysis;
    }
  }

  const firstMoment = match.moments[0];
  update({ momentId: firstMoment?.id, candidateId: firstMoment?.candidatePlayerIds[0], progress: 0 });

  return {
    update,
    destroy() {
      events.abort();
      pitch.destroy();
      shell.remove();
    },
  };
}

function createSelector(container, id, label, emptyText, onChange, signal) {
  container.classList.add("gx-select");
  container.innerHTML = `
    <span class="gx-label" id="${id}-label">${label}</span>
    <button class="gx-select-trigger" id="${id}-trigger" type="button"
      aria-labelledby="${id}-label ${id}-value" aria-haspopup="listbox"
      aria-controls="${id}-list" aria-expanded="false">
      <span id="${id}-value"></span>
    </button>
    <div class="gx-options" id="${id}-list" role="listbox" aria-labelledby="${id}-label" hidden></div>`;
  const doc = container.ownerDocument;
  const trigger = container.querySelector("button");
  const valueText = trigger.firstElementChild;
  const list = container.querySelector('[role="listbox"]');
  let options = [];
  let selected = -1;
  let active = -1;
  let typed = "";
  let lastKeyTime = 0;

  function select(index) {
    options[selected]?.element.setAttribute("aria-selected", "false");
    selected = index;
    options[selected]?.element.setAttribute("aria-selected", "true");
    setText(valueText, options[selected]?.label ?? (options.length ? "Select an option" : emptyText));
  }

  function focusOption(index) {
    active = index;
    const { element } = options[index];
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
  }

  function open(fallbackIndex = 0) {
    if (!options.length) return;
    const bounds = trigger.getBoundingClientRect();
    const below = doc.documentElement.clientHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    const placeAbove = below < 176 && above > below;
    list.classList.toggle("gx-options-above", placeAbove);
    list.style.maxHeight = `${Math.min(256, placeAbove ? above : below)}px`;
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    focusOption(selected < 0 ? fallbackIndex : selected);
  }

  function close(restoreFocus = false) {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    typed = "";
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function choose(index) {
    const changed = selected !== index;
    select(index);
    close(true);
    if (changed) onChange(options[index].id);
  }

  function typeAhead(event) {
    const key = event.key.toLocaleLowerCase();
    const recent = event.timeStamp - lastKeyTime < 600;
    typed = recent && typed !== key ? typed + key : key;
    lastKeyTime = event.timeStamp;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (active + offset) % options.length;
      if (options[index].label.toLocaleLowerCase().startsWith(typed)) {
        focusOption(index);
        return;
      }
    }
  }

  trigger.addEventListener("click", () => list.hidden ? open() : close(true), { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowUp" ? options.length - 1 : 0);
    }
  }, { signal });
  list.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) choose(options.findIndex(({ element }) => element === option));
  }, { signal });
  list.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown": focusOption(Math.min(active + 1, options.length - 1)); break;
      case "ArrowUp": focusOption(Math.max(active - 1, 0)); break;
      case "Home": focusOption(0); break;
      case "End": focusOption(options.length - 1); break;
      case "Enter":
      case " ": choose(active); break;
      case "Escape": close(true); break;
      case "Tab": close(true); return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          typeAhead(event);
        }
        return;
    }
    event.preventDefault();
  }, { signal });
  doc.addEventListener("pointerdown", (event) => {
    if (!container.contains(event.target)) close();
  }, { signal });
  container.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !container.contains(event.relatedTarget)) close();
  }, { signal });

  return {
    setOptions(nextOptions) {
      close(list.contains(doc.activeElement));
      selected = -1;
      options = nextOptions.map((option) => {
        const element = doc.createElement("div");
        element.setAttribute("role", "option");
        element.setAttribute("aria-selected", "false");
        element.tabIndex = -1;
        element.textContent = option.label;
        return { ...option, element };
      });
      list.replaceChildren(...options.map(({ element }) => element));
      trigger.disabled = options.length === 0;
      select(-1);
    },
    setValue(value) {
      const index = options.findIndex(({ id: optionId }) => optionId === value);
      if (index !== selected) select(index);
    },
  };
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setOptionalText(element, text) {
  element.hidden = !text;
  setText(element, text ?? "");
}

function renderAnalysis(root, analysis) {
  const doc = root.ownerDocument;
  function add(parent, tag, text, className) {
    const element = doc.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }

  root.replaceChildren();
  if (!analysis) {
    add(root, "p", "Compare players to see the scenario metrics and recommendation.", "gx-empty");
    return;
  }

  if (analysis.metrics.length) {
    const table = add(root, "table", null, "gx-metrics");
    add(table, "caption", "Scenario metrics");
    const headings = add(add(table, "thead"), "tr");
    for (const label of ["Metric", "Original", "Alt.", "Change"]) {
      add(headings, "th", label).scope = "col";
    }
    const rows = add(table, "tbody");
    const explanations = add(root, "details", null, "gx-explanations");
    add(explanations, "summary", "Metric explanations");
    const definitions = add(explanations, "dl");

    for (const metric of analysis.metrics) {
      const row = add(rows, "tr");
      const name = add(row, "th", metric.label);
      name.scope = "row";
      if (metric.unit) add(name, "small", metric.unit);
      add(row, "td", numberFormat.format(metric.baseline));
      add(row, "td", numberFormat.format(metric.alternative));
      const delta = add(row, "td", deltaFormat.format(metric.delta));
      if (metric.delta !== 0) {
        const improved = metric.better === "higher" ? metric.delta > 0 : metric.delta < 0;
        delta.className = improved ? "gx-better" : "gx-worse";
        delta.title = improved ? "Improved" : "Worsened";
      }
      add(definitions, "dt", metric.label);
      add(definitions, "dd", metric.explanation);
    }
  }

  const { recommendation, qualityLabel } = analysis;
  const coaching = add(root, "div", null, "gx-coaching");
  add(coaching, "h3", "Recommendation");
  add(coaching, "p", recommendation.title, "gx-recommendation");
  const reasons = add(coaching, "ul");
  for (const reason of recommendation.reasoning) add(reasons, "li", reason);
  add(coaching, "p", recommendation.caveat, "gx-caveat");
  add(root, "p", qualityLabel, "gx-quality");
}
