import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DomainError, requireValue } from "../src/domain/validation.js";
import { validateReplay } from "../src/data/replay.js";
import { buildSkillCornerClips, normalizeClubUpload } from "../src/data/skillcorner-package.js";

// The three files SkillCorner delivers per match, with generous size ceilings.
const PARTS = {
  match: { file: "match.json", maxBytes: 10 * 1024 ** 2 },
  events: { file: "dynamic_events.csv", maxBytes: 200 * 1024 ** 2 },
  tracking: { file: "tracking.jsonl", maxBytes: 1024 ** 3 },
};

/**
 * PUT  /api/v1/uploads/:uploadId/:part   raw file body (part = match | events | tracking)
 * POST /api/v1/uploads/:uploadId/import  validates the package and adds the match to the catalog
 */
export function createUploadHandler({ directory, service, reload }) {
  const staging = join(directory, "staging");
  const replays = join(directory, "replays");
  let importing = false;

  async function receive(request, uploadId, part) {
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
        "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" });
      response.end(); return true;
    }
    if (request.method !== method) {
      response.setHeader("Allow", `${method}, OPTIONS`);
      throw new DomainError(`Use ${method} for this route.`, "METHOD_NOT_ALLOWED", 405);
    }
    const result = action === "import" ? await importPackage(uploadId) : await receive(request, uploadId, action);
    send(response, action === "import" ? 201 : 200, { data: result });
    return true;
  };
}
