import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { requireValue } from "../domain/validation.js";
import { normalizeSkillCorner } from "./skillcorner.js";

/**
 * Club uploads of a SkillCorner match package: the same three files SkillCorner
 * delivers to licensed clubs (and publishes as open data), so one validated path
 * serves both. Window selection mirrors scripts/prepare-skillcorner.py exactly;
 * nothing is interpolated, renamed or invented.
 */

// Real packages: ~2–3 KB per tracking line, ~70k frames, ~10k event rows. These caps
// bound memory for malformed or hostile files instead of buffering them whole.
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_FRAMES = 250_000;
const MAX_EVENT_ROWS = 150_000;

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF. Rows become objects keyed by the header. */
export function parseCsv(text, { maxRows = MAX_EVENT_ROWS } = {}) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
      requireValue(rows.length <= maxRows + 1, `The events file has more than ${maxRows} rows.`);
    }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  requireValue(header && header.length > 1, "The events file needs a CSV header row.");
  return body.filter((r) => r.length > 1 || r[0] !== "")
    .map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])));
}

/** Yields JSON Lines text; refuses any line over MAX_LINE_BYTES before buffering more of it. */
export async function* readJsonLines(path, maxLineBytes = MAX_LINE_BYTES) {
  const tooLong = `A tracking line is longer than ${Math.round(maxLineBytes / 1024)} KB; expected one frame per line.`;
  let carry = Buffer.alloc(0);
  for await (const chunk of createReadStream(path)) {
    const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let start = 0, newline;
    while ((newline = data.indexOf(10, start)) !== -1) {
      requireValue(newline - start <= maxLineBytes, tooLong);
      yield data.toString("utf8", start, newline);
      start = newline + 1;
    }
    carry = data.subarray(start);
    requireValue(carry.length <= maxLineBytes, tooLong);
  }
  if (carry.length) yield carry.toString("utf8");
}

async function fileSource(path, name) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { url: `upload:${name}`, sha256: hash.digest("hex"), bytes: (await stat(path)).size };
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

export async function buildSkillCornerClips({ metadataPath, eventsPath, trackingPath, windowSeconds = 8, windowsPerMatch = 5, fps = 10 }) {
  let metadata;
  try { metadata = JSON.parse((await readFile(metadataPath, "utf8")).replace(/^﻿/, "")); }
  catch { requireValue(false, "The match file is not valid JSON."); }
  requireValue(Number.isInteger(metadata?.id) && Array.isArray(metadata.players) && metadata.home_team && metadata.away_team
    && finite(metadata.pitch_length) && finite(metadata.pitch_width),
  "The match file is not a SkillCorner match JSON (id, players, both teams and pitch size are required).");
  const roster = new Map(metadata.players.map((p) => [p.id, p]));
  requireValue(roster.size === metadata.players.length, "The match file lists the same player ID twice.");
  const teamIds = [metadata.home_team.id, metadata.away_team.id];

  const rows = parseCsv((await readFile(eventsPath, "utf8")).replace(/^﻿/, ""));
  requireValue(rows.length > 0 && ["match_id", "event_type", "frame_start"].every((key) => key in rows[0]),
    "The events file is not a SkillCorner dynamic events CSV.");
  requireValue(rows.every((r) => Number(r.match_id) === metadata.id), "The events file belongs to a different match than the match file.");
  const possessions = rows.filter((r) => r.event_type === "player_possession");
  requireValue(possessions.length > 0, "The events file has no player possessions to anchor replay windows.");
  for (const row of possessions) row.priority = (row.lead_to_goal === "True" ? 100 : 0) + (row.end_type === "shot" ? 10 : 0);
  // Shots and goal-leading possessions first, then a spread of ordinary possessions.
  const selected = [];
  for (const row of [...possessions].sort((a, b) => b.priority - a.priority || Number(a.frame_start) - Number(b.frame_start))) {
    if (!selected.some((other) => Math.abs(Number(row.frame_start) - Number(other.frame_start)) < 150)) selected.push(row);
    if (selected.length === 80) break;
  }
  const byStart = new Map(selected.map((r) => [Number(r.frame_start), r]));
  const count = windowSeconds * fps + 1;

  const complete = (frames) => {
    if (frames.length !== count || ![1, 2].includes(frames[0].period) || frames.some((f) => f.period !== frames[0].period)) return false;
    let identity = null;
    for (const [i, frame] of frames.entries()) {
      if (frame.frame !== frames[0].frame + i || frame.timestamp === null || frame.timestamp === undefined) return false;
      const players = Array.isArray(frame.player_data) ? frame.player_data : [];
      const ids = new Set(players.map((p) => p.player_id));
      if (players.length !== 22 || ids.size !== 22 || ![...ids].every((id) => roster.has(id))
        || (identity && ![...ids].every((id) => identity.has(id)))) return false;
      identity = ids;
      if (teamIds.some((team) => [...ids].filter((id) => roster.get(id).team_id === team).length !== 11)) return false;
      for (const p of [frame.ball_data ?? {}, ...players]) {
        if (!finite(p.x) || !finite(p.y)) return false;
        if (Math.abs(p.x) > metadata.pitch_length / 2 || Math.abs(p.y) > metadata.pitch_width / 2) return false;
      }
    }
    const detected = frames.reduce((n, f) => n + f.player_data.filter((p) => p.is_detected === true).length, 0);
    return detected >= count * 5 && frames.some((f) => f.ball_data?.is_detected === true);
  };

  let active = [], lines = 0, missingPeriodFrames = 0;
  const eligible = [];
  for await (const line of readJsonLines(trackingPath)) {
    if (!line.trim()) continue;
    let frame;
    try { frame = JSON.parse(line); }
    catch { requireValue(false, `Tracking line ${lines + 1} is not valid JSON; expected SkillCorner JSON Lines.`); }
    lines++;
    requireValue(lines <= MAX_FRAMES, `The tracking file has more than ${MAX_FRAMES} frames.`);
    const row = byStart.get(frame.frame);
    if (row) active.push({ event: row, frames: [] });
    const next = [];
    for (const window of active) {
      window.frames.push(frame);
      if (window.frames.length === count) { if (complete(window.frames)) eligible.push(window); }
      else next.push(window);
    }
    active = next;
    missingPeriodFrames += Number(frame.period === null || frame.period === undefined);
  }
  requireValue(lines > 0, "The tracking file is empty.");
  const chosen = [];
  for (const window of eligible.sort((a, b) => b.event.priority - a.event.priority || a.frames[0].frame - b.frames[0].frame)) {
    if (chosen.some((w) => Math.abs(window.frames[0].frame - w.frames[0].frame) <= count)) continue;
    chosen.push(window);
    if (chosen.length === windowsPerMatch) break;
  }
  requireValue(chosen.length > 0, "No 8-second window has all 22 players, the ball and enough detected positions; nothing was imported.");
  chosen.sort((a, b) => a.frames[0].frame - b.frames[0].frame);
  const files = { metadata: await fileSource(metadataPath, "match.json"),
    events: await fileSource(eventsPath, "dynamic_events.csv"), tracking: await fileSource(trackingPath, "tracking.jsonl") };
  // A 40-hex content fingerprint of the three files stands in for the open-data Git revision.
  const revision = createHash("sha1").update(Object.values(files).map((f) => f.sha256).join(":")).digest("hex");
  return { schemaVersion: "skillcorner-clips-1", metadata, windows: chosen, possessions, revision, files,
    excludedFramesWithoutPeriod: missingPeriodFrames };
}

/** Same validated normalization as open data, relabelled so an upload is never shown as public or as ours. */
export function normalizeClubUpload(bundle) {
  requireValue(typeof bundle?.upload?.uploadedAt === "string", "Uploaded package is missing its upload record.");
  const match = normalizeSkillCorner(bundle);
  const edition = bundle.metadata.competition_edition;
  return { ...match,
    competition: edition?.competition?.name ?? null,
    season: edition?.season?.name ?? null,
    source: { ...match.source, name: "Club upload · SkillCorner format", url: `upload:${bundle.files.tracking.sha256}`,
      license: "Supplied by the uploading club under its own data licence; stored only on this server and never redistributed.",
      distribution: "club-supplied named broadcast tracking; selected source windows", uploadedAt: bundle.upload.uploadedAt },
    limitations: [...match.limitations,
      "Uploaded by a club: GhostXI checks file hashes, identities and coordinates, but cannot verify the club's licence for this data."] };
}
