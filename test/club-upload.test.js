import assert from "node:assert/strict";
import { test } from "node:test";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildSkillCornerClips, normalizeClubUpload, parseCsv } from "../src/data/skillcorner-package.js";
import { validateReplay } from "../src/data/replay.js";

const cache = fileURLToPath(new URL("../work/datasets/skillcorner/4340d274572876239c154c90bc507a9b3250a656/", import.meta.url));
const prepared = new URL("../src/data/skillcorner/replays/2015213.json", import.meta.url);
const available = await access(`${cache}2015213_tracking.jsonl`).then(() => access(prepared)).then(() => true, () => false);
const files = (id) => ({ metadataPath: `${cache}${id}_match.json`, eventsPath: `${cache}${id}_dynamic_events.csv`,
  trackingPath: `${cache}${id}_tracking.jsonl` });

test("parseCsv handles quoted commas, doubled quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"x, ""y"""\r\n2,\r\n'), [{ a: "1", b: 'x, "y"' }, { a: "2", b: "" }]);
});

test("a club upload selects exactly the windows the Python importer selects", { skip: !available && "run npm run prepare:tracking first" }, async () => {
  const bundle = await buildSkillCornerClips(files(2015213));
  const python = JSON.parse(await readFile(prepared, "utf8"));
  assert.deepEqual(bundle.windows.map((w) => w.frames[0].frame), python.windows.map((w) => w.frames[0].frame));
  assert.equal(bundle.files.tracking.sha256, python.files.tracking.sha256);
  const match = normalizeClubUpload({ ...bundle, upload: { uploadedAt: "2026-11-12T00:00:00.000Z" } });
  assert.equal(match.source.name, "Club upload · SkillCorner format");
  assert.equal(match.competition, "A-League");
  assert.ok(match.limitations.some((text) => /cannot verify the club's licence/.test(text)));
  assert.ok(validateReplay(match).playable);
});

test("files from two different matches are rejected before any tracking is read", { skip: !available && "run npm run prepare:tracking first" }, async () => {
  await assert.rejects(buildSkillCornerClips({ ...files(2015213), eventsPath: files(2016236).eventsPath }),
    /different match/);
});
