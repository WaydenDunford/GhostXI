import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { buildSkillCornerClips, normalizeClubUpload, parseCsv, readJsonLines } from "../src/data/skillcorner-package.js";
import { validateReplay } from "../src/data/replay.js";
import { createUploadHandler } from "../server/club-uploads.js";

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

test("over-long tracking lines and oversized event files are refused, not buffered", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ghostxi-lines-"));
  try {
    const path = join(dir, "t.jsonl");
    await writeFile(path, '{"frame":1}\r\n{"frame":2}\n');
    const lines = [];
    for await (const line of readJsonLines(path, 64)) lines.push(JSON.parse(line).frame);
    assert.deepEqual(lines, [1, 2]);
    await writeFile(path, `{"frame":1}\n${"x".repeat(200)}\n`);
    await assert.rejects((async () => { for await (const _ of readJsonLines(path, 64)); })(), /longer than/);
    await writeFile(path, "x".repeat(200)); // no newline at all
    await assert.rejects((async () => { for await (const _ of readJsonLines(path, 64)); })(), /longer than/);
  } finally { await rm(dir, { recursive: true, force: true }); }
  assert.throws(() => parseCsv("a,b\n1,2\n3,4\n5,6\n", { maxRows: 2 }), /more than 2 rows/);
});

test("upload routes require the key when one is configured", async () => {
  const handler = createUploadHandler({ directory: tmpdir(), service: {}, reload: async () => {}, token: "club-secret" });
  const call = (authorization) => handler({ request: { method: "POST", headers: authorization ? { authorization } : {} },
    response: {}, params: ["api", "v1", "uploads", "abcdefgh", "import"], send: () => {} });
  await assert.rejects(call(), (e) => e.status === 401 && e.code === "UPLOAD_KEY_REQUIRED");
  await assert.rejects(call("Bearer wrong"), (e) => e.status === 401);
});

// A direct same-machine request, as Node's http server would present it.
const localRequest = (method, headers = {}, body = null) => Object.assign(body ? Readable.from([Buffer.from(body)]) : {},
  { method, headers: { host: "127.0.0.1:8787", ...headers }, socket: { remoteAddress: "127.0.0.1" } });

test("without a key, uploads are off unless local mode is explicitly enabled", async () => {
  const call = (handler, headers = {}, remoteAddress = "127.0.0.1") => handler({
    request: { ...localRequest("POST", headers), socket: { remoteAddress } },
    response: {}, params: ["api", "v1", "uploads", "abcdefgh", "import"], send: () => {} });
  const off = createUploadHandler({ directory: tmpdir(), service: {}, reload: async () => {} });
  await assert.rejects(call(off), (e) => e.status === 403 && e.code === "UPLOADS_DISABLED");
  const local = createUploadHandler({ directory: join(tmpdir(), "ghostxi-none"), service: {}, reload: async () => {}, allowLocal: true });
  for (const [headers, remote] of [[{ host: "evil.example:8787" }, "127.0.0.1"], [{ "x-forwarded-for": "203.0.113.9" }, "127.0.0.1"],
    [{ forwarded: "for=203.0.113.9" }, "127.0.0.1"], [{}, "203.0.113.9"]]) {
    await assert.rejects(call(local, headers, remote), (e) => e.status === 401, JSON.stringify(headers));
  }
  // A genuine local request passes access control and reaches validation (no files staged).
  await assert.rejects(call(local), (e) => e.status === 400 && /Upload the match file/.test(e.message));
  await assert.rejects(call(local, { "x-forwarded-for": "127.0.0.1" }), (e) => e.status === 400);
});

test("concurrent uploads cannot exceed the staging cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ghostxi-race-"));
  try {
    const handler = createUploadHandler({ directory: dir, service: {}, reload: async () => {}, allowLocal: true });
    const results = await Promise.allSettled(["race-0001", "race-0002", "race-0003", "race-0004", "race-0005"].map((id) =>
      handler({ request: localRequest("PUT", {}, "{}"), response: {}, params: ["api", "v1", "uploads", id, "match"], send: () => {} })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.status === 429));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("staging is capped and abandoned uploads are swept", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ghostxi-staging-"));
  try {
    for (const id of ["pending-1", "pending-2", "pending-3"]) await mkdir(join(dir, "staging", id), { recursive: true });
    const handler = createUploadHandler({ directory: dir, service: {}, reload: async () => {}, allowLocal: true });
    const sent = [];
    const put = (id) => handler({ request: localRequest("PUT", {}, "{}"),
      response: {}, params: ["api", "v1", "uploads", id, "match"], send: (_response, status, body) => sent.push([status, body]) });
    await assert.rejects(put("pending-4"), (e) => e.status === 429);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(join(dir, "staging", "pending-1"), old, old);
    assert.equal(await put("pending-4"), true); // the stale folder was swept, freeing a slot
    assert.deepEqual(sent, [[200, { data: { uploadId: "pending-4", part: "match", bytes: 2 } }]]);
    assert.deepEqual((await readdir(join(dir, "staging"))).sort(), ["pending-2", "pending-3", "pending-4"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
