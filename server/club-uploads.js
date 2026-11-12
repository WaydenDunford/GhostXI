import { createHash, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DomainError, requireValue } from "../src/domain/validation.js";
import { validateReplay } from "../src/data/replay.js";
import { buildSkillCornerClips, normalizeClubUpload } from "../src/data/skillcorner-package.js";

// The three files SkillCorner delivers per match. Real packages are ~30 KB, ~5 MB
// and ~100 MB; the ceilings leave headroom without allowing runaway disk use.
const PARTS = {
  match: { file: "match.json", maxBytes: 5 * 1024 ** 2 },
  events: { file: "dynamic_events.csv", maxBytes: 25 * 1024 ** 2 },
  tracking: { file: "tracking.jsonl", maxBytes: 300 * 1024 ** 2 },
};
const MAX_PENDING = 3; // staged packages at once: about 1 GB on disk in the worst case
const STALE_MS = 30 * 60 * 1000; // abandoned staging folders are deleted after 30 minutes
const digest = (value) => createHash("sha256").update(value).digest();

/**
 * PUT  /api/v1/uploads/:uploadId/:part   raw file body (part = match | events | tracking)
 * POST /api/v1/uploads/:uploadId/import  validates the package and adds the match to the catalog
 *
 * With `token`, every upload request needs `Authorization: Bearer <token>`. Without it,
 * server/index.js only enables uploads when the API listens on a loopback address.
 */
export function createUploadHandler({ directory, service, reload, token = null }) {
  const staging = join(directory, "staging");
  const replays = join(directory, "replays");
  let importing = false;

  const authorized = (request) => {
    if (!token) return true;
    const header = request.headers?.authorization ?? "";
    // Hashing first gives equal-length inputs, so the comparison leaks no timing.
    return timingSafeEqual(digest(header.startsWith("Bearer ") ? header.slice(7) : ""), digest(token));
  };

  async function liveStagingFolders() {
    let names = [];
    try { names = await readdir(staging); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const live = [];
    for (const name of names) {
      const folder = join(staging, name);
      try {
        if (Date.now() - (await stat(folder)).mtimeMs > STALE_MS) await rm(folder, { recursive: true, force: true });
        else live.push(name);
      } catch { /* removed by a concurrent request */ }
    }
    return live;
  }

  async function receive(request, uploadId, part) {
    const live = await liveStagingFolders();
    if (!live.includes(uploadId) && live.length >= MAX_PENDING) {
      throw new DomainError("Too many uploads are in progress; finish one or try again shortly.", "UPLOADS_BUSY", 429);
    }
    const folder = join(staging, uploadId);
    await mkdir(folder, { recursive: true });
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > PARTS[part].maxBytes) done(new DomainError(`The ${part} file is larger than this server accepts.`, "BODY_TOO_LARGE", 413));
      else done(null, chunk);
    } });
    await pipeline(request, limit, createWriteStream(join(folder, PARTS[part].file)));
    requireValue(bytes > 0, `The ${part} file is empty.`);
    return { uploadId, part, bytes };
  }

  async function importPackage(uploadId) {
    if (importing) throw new DomainError("Another match is being imported; try again in a moment.", "IMPORT_BUSY", 409);
    importing = true;
    const folder = join(staging, uploadId);
    try {
      for (const part of Object.keys(PARTS)) {
        try { await stat(join(folder, PARTS[part].file)); }
        catch { requireValue(false, `Upload the ${part} file before importing.`); }
      }
      const bundle = await buildSkillCornerClips({ metadataPath: join(folder, PARTS.match.file),
        eventsPath: join(folder, PARTS.events.file), trackingPath: join(folder, PARTS.tracking.file) });
      bundle.upload = { uploadedAt: new Date().toISOString() };
      const match = normalizeClubUpload(bundle);
      const validation = validateReplay(match);
      requireValue(validation.playable, "The files were read, but no continuous 8-second 22-player window passed validation.");
      const existing = service.listReplayMatches().find((m) => m.id === match.id);
      requireValue(!existing || existing.source?.name === match.source.name,
        "This match is already loaded from another source; it was not replaced.");
      await mkdir(replays, { recursive: true });
      const target = join(replays, `${bundle.metadata.id}.json`);
      await writeFile(`${target}.tmp`, JSON.stringify(bundle));
      await rename(`${target}.tmp`, target);
      await reload();
      return { id: match.id, name: match.name, date: match.date, competition: match.competition, season: match.season,
        score: match.score, windows: validation.segments.length, replaced: !!existing };
    } finally {
      importing = false;
      await rm(folder, { recursive: true, force: true });
    }
  }

  return async function handleUploadRequest({ request, response, params, send }) {
    if (!(params[0] === "api" && params[1] === "v1" && params[2] === "uploads")) return false;
    const [uploadId, action] = params.slice(3);
    requireValue(params.length === 5 && /^[a-z0-9-]{8,64}$/.test(uploadId ?? ""),
      "Use /api/v1/uploads/<upload-id>/<match|events|tracking|import>.");
    requireValue(action === "import" || Object.hasOwn(PARTS, action), "Unknown upload part; use match, events, tracking or import.");
    const method = action === "import" ? "POST" : "PUT";
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Methods": `${method}, OPTIONS`,
        "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" });
      response.end(); return true;
    }
    if (request.method !== method) {
      response.setHeader("Allow", `${method}, OPTIONS`);
      throw new DomainError(`Use ${method} for this route.`, "METHOD_NOT_ALLOWED", 405);
    }
    if (!authorized(request)) throw new DomainError("This server requires an upload key.", "UPLOAD_KEY_REQUIRED", 401);
    const result = action === "import" ? await importPackage(uploadId) : await receive(request, uploadId, action);
    send(response, action === "import" ? 201 : 200, { data: result });
    return true;
  };
}
