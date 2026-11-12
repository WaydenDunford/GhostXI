import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { DomainError, requireValue } from "../src/domain/validation.js";
import { handleSubstitutionRequest } from "./substitution-routes.js";

const PREFIX = "/api/v1";
const MAX_BODY = 16 * 1024;
const publicAssets = new Map([
  ["/", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]],
  ...["src/main.js", "src/ui/verified-dashboard.js", "src/ui/dashboard.js", "src/ui/pitch.js", "src/client/ghostxi.js", "src/replay/controller.js"]
    .map((path) => [`/${path}`, [path, "text/javascript"]]),
  ["/src/ui/ui.css", ["src/ui/ui.css", "text/css"]],
]);

function send(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}

async function comparisonBody(request, allowSeed = false) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new DomainError("Send Content-Type: application/json.", "UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw new DomainError("Request body exceeds 16 KiB.", "BODY_TOO_LARGE", 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new DomainError("Request body is not valid JSON.", "INVALID_JSON"); }
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Comparison input must be an object.");
  const fields = ["matchId", "momentId", "candidateId"];
  requireValue(fields.every((key) =>
    typeof body[key] === "string" && body[key].length > 0 && body[key].length <= 120),
  "Provide matchId, momentId and candidateId as nonempty strings (max 120 characters).");
  requireValue(Object.keys(body).every((key) => fields.includes(key) || (allowSeed && key === "seed")), "Unknown comparison input field.");
  requireValue(body.seed === undefined || (allowSeed && Number.isInteger(body.seed) && body.seed >= 0 && body.seed <= 0xffffffff), "seed must be an unsigned 32-bit integer.");
  return body;
}

export function createApiServer({ service, allowedOrigins = [] }) {
  const origins = new Set(allowedOrigins);
  const server = createServer(async (request, response) => {
    response.setHeader("Vary", "Origin");
    try {
      const origin = request.headers.origin;
      if (origin && !origins.has(origin)) throw new DomainError("This browser origin is not allowed. Configure CORS_ORIGINS.", "ORIGIN_NOT_ALLOWED", 403);
      if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;
      let params;
      try { params = pathname.split("/").filter(Boolean).map(decodeURIComponent); }
      catch { throw new DomainError("Invalid URL encoding.", "INVALID_URL"); }
      if (request.method === "GET" && publicAssets.has(pathname)) {
        const [path, mime] = publicAssets.get(pathname);
        response.writeHead(200, { "Content-Type": `${mime}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        response.end(await readFile(new URL(`../${path}`, import.meta.url))); return;
      }
      if (await handleSubstitutionRequest({ request, response, url, params, service })) return;
      const isComparison = pathname === `${PREFIX}/comparisons`;
      const isAISimulation = pathname === `${PREFIX}/ai/simulations`;
      const aiRoute = params[0] === "api" && params[1] === "v1" && params[2] === "ai"
        && ((params.length === 4 && ["profiles", "scenarios", "status"].includes(params[3]))
          || (params.length === 5 && params[3] === "profiles"));
      const matchRoute = params[0] === "api" && params[1] === "v1" && params[2] === "matches";
      const isMatchRoot = matchRoute && params.length === 4;
      const matchSubroute = matchRoute && params.length === 5 && ["candidates", "momentum", "scouting"].includes(params[4]);
      const scenarioRoute = matchRoute && params.length === 6 && params[4] === "scenarios";
      const datasetsRoute = pathname === `${PREFIX}/datasets`;
      const logoRoute = pathname === `${PREFIX}/datasets/statsbomb/logo`;
      const eventRoute = params[0] === "api" && params[1] === "v1" && params[2] === "statsbomb" && params[3] === "matches"
        && (params.length === 4 || params.length === 5 || (params.length === 6 && ["events", "players", "momentum"].includes(params[5])));
      const marketRoute = params[0] === "api" && params[1] === "v1" && params[2] === "transfermarkt" && params[3] === "players"
        && [4, 5].includes(params.length);
      const known = ["/health", `${PREFIX}/matches`, `${PREFIX}/methodology`].includes(pathname)
        || isComparison || isAISimulation || aiRoute || isMatchRoot || matchSubroute || scenarioRoute || datasetsRoute || logoRoute || eventRoute || marketRoute;
      if (!known) throw new DomainError("API route not found.", "NOT_FOUND", 404);
      const method = isComparison || isAISimulation ? "POST" : "GET";
      if (request.method === "OPTIONS") {
        response.writeHead(204, { "Access-Control-Allow-Methods": `${method}, OPTIONS`,
          "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" });
        response.end(); return;
      }
      if (request.method !== method) {
        response.setHeader("Allow", `${method}, OPTIONS`);
        throw new DomainError(`Use ${method} for this route.`, "METHOD_NOT_ALLOWED", 405);
      }
      const allowedQuery = matchSubroute && params[4] === "candidates" ? ["momentId"]
        : matchSubroute && params[4] === "scouting" ? ["candidateId"]
        : eventRoute && params[5] === "events" ? ["type", "teamId", "playerId", "limit", "offset"]
        : marketRoute && params.length === 4 ? ["search", "country", "position", "minAge", "maxAge", "asOf", "limit", "offset"]
        : marketRoute ? ["asOf"] : [];
      requireValue([...url.searchParams.keys()].every((key) => allowedQuery.includes(key)
        && url.searchParams.getAll(key).length === 1), "Unknown or repeated query parameter.");
      let result;
      if (pathname === "/health") result = { status: "ok", schemaVersion: "1.0", dataReady: true,
        externalDataReady: service.getExternalDatasets().statsbomb.ready, behaviorReady: service.getBehaviorStatus().ready };
      else if (pathname === `${PREFIX}/matches`) result = service.listMatches().filter((m) => service.listReplayMatches().some((v) => v.id === m.id));
      else if (pathname === `${PREFIX}/methodology`) result = service.getMethodology();
      else if (datasetsRoute) result = service.getExternalDatasets();
      else if (isAISimulation) result = service.runBehaviorSimulation(await comparisonBody(request, true));
      else if (aiRoute) {
        if (params[3] === "status") result = service.getBehaviorStatus();
        else if (params[3] === "scenarios") result = service.getBehaviorScenarios();
        else result = params.length === 5 ? service.getBehaviorProfile(params[4]) : service.getBehaviorProfiles();
      }
      else if (logoRoute) {
        if (!service.getExternalDatasets().statsbomb.ready) throw new DomainError("Prepare the external datasets first.", "EXTERNAL_DATA_NOT_READY", 503);
        const logo = await readFile(new URL("../src/data/statsbomb/statsbomb-logo.png", import.meta.url));
        response.writeHead(200, { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" });
        response.end(logo); return;
      }
      else if (eventRoute) {
        if (params.length === 4) result = service.getEventMatches();
        else if (params.length === 5) result = service.getEventMatch(params[4]);
        else if (params[5] === "players") result = service.getEventPlayers(params[4]);
        else if (params[5] === "momentum") result = service.getEventMomentum(params[4]);
        else result = service.getEventList(params[4], Object.fromEntries(url.searchParams));
      }
      else if (marketRoute) {
        result = params.length === 4 ? service.getMarketPlayers(Object.fromEntries(url.searchParams))
          : service.getMarketPlayer(params[4], url.searchParams.get("asOf") ?? undefined);
      }
      else if (isComparison) {
        await comparisonBody(request);
        throw new DomainError("The fictional-profile comparison endpoint is retired. Create a verified /api/scenarios substitution and POST /api/scenarios/:id/simulate.", "LEGACY_DEMO_RETIRED", 410);
      }
      else {
        const matchId = params[3];
        service.getReplayMatch(matchId); // same eligibility gate on legacy replay routes
        if (isMatchRoot) {
          result = service.getMatch(matchId);
          result.players = result.players.filter((p) => p.dataKind === "OBSERVED");
          result.moments = result.moments.map((m) => ({ ...m, candidatePlayerIds: [] }));
        }
        else if (scenarioRoute) { result = service.getScenario(matchId, params[5]); result.candidatePlayerIds = []; }
        else if (params[4] === "momentum") result = service.getMomentum(matchId);
        else if (params[4] === "candidates") {
          const moment = url.searchParams.get("momentId") ?? service.getMatch(matchId).moments[0].id;
          result = service.getReplacementCandidates({ matchId, replacePlayerId: service.getScenario(matchId, moment).targetPlayerId });
        }
        else {
          const candidateId = url.searchParams.get("candidateId");
          requireValue(typeof candidateId === "string" && candidateId.length > 0, "candidateId is required for scouting.");
          result = await service.getCandidateAssessment({ matchId, candidateId });
        }
      }
      send(response, 200, { data: result });
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      const expected = error instanceof DomainError;
      send(response, expected ? error.status : 500, { error: { code: expected ? error.code : "INTERNAL_ERROR",
        message: expected ? error.message : "The request could not be processed." } });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
