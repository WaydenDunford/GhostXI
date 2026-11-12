import { DomainError, requireValue } from "../src/domain/validation.js";

async function body(request) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new DomainError("Send Content-Type: application/json.", "UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const parts = []; let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > 16384) throw new DomainError("Request body exceeds 16 KiB.", "BODY_TOO_LARGE", 413);
    parts.push(part);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new DomainError("Invalid JSON request body.", "INVALID_JSON"); }
  requireValue(value && typeof value === "object" && !Array.isArray(value), "The request body must be an object.");
  return value;
}

export async function handleSubstitutionRequest({ request, response, url, params, service }) {
  if (params[0] !== "api" || params[1] === "v1") return false;
  const lineup = params[1] === "matches" && params.length === 4 && params[3] === "lineup";
  const moments = params[1] === "matches" && params.length === 4 && params[3] === "moments";
  const candidates = params[1] === "candidates" && params.length === 2;
  const collection = params[1] === "scenarios" && params.length === 2;
  const resource = params[1] === "scenarios" && params.length === 3;
  const operation = params[1] === "scenarios" && params.length === 4 && ["simulate", "duplicate", "findings"].includes(params[3]);
  const scouting = params[1] === "scouting" && params.length === 2;
  const config = params[1] === "recommendation" && params[2] === "config" && params.length === 3;
  const datasetStatus = params[1] === "datasets" && params[2] === "status" && params.length === 3;
  const matchList = params[1] === "matches" && params.length === 2;
  const matchDetail = params[1] === "matches" && params.length === 3;
  const tracking = params[1] === "matches" && params.length === 4 && params[3] === "tracking";
  if (!(lineup || moments || candidates || collection || resource || operation || scouting || config || datasetStatus || matchList || matchDetail || tracking)) return false;
  const methods = collection ? ["GET", "POST"] : resource ? ["GET", "PATCH", "PUT", "DELETE"]
    : operation && params[3] !== "findings" ? ["POST"] : ["GET"];
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
      "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" }); response.end(); return true;
  }
  if (!methods.includes(request.method)) {
    response.setHeader("Allow", [...methods, "OPTIONS"].join(", "));
    throw new DomainError("This HTTP method is unavailable for the scenario route.", "METHOD_NOT_ALLOWED", 405);
  }
  const allowedQuery = moments ? ["playerId", "limit", "position"] : tracking ? ["momentId", "period", "fromSec", "toSec", "offset", "limit"] : candidates ? ["matchId", "replacePlayerId"]
    : scouting ? ["candidateId", "matchId"] : collection && request.method === "GET" ? ["matchId", "candidateId"] : [];
  requireValue([...url.searchParams.keys()].every((key) => allowedQuery.includes(key) && url.searchParams.getAll(key).length === 1), "Unknown or repeated query parameter.");
  const query = Object.fromEntries(url.searchParams);
  const required = (...keys) => requireValue(keys.every((key) => typeof query[key] === "string" && query[key].length > 0 && query[key].length <= 180), "Required query IDs are missing or invalid.");
  let result, status = 200;
  if (datasetStatus) result = service.getDatasetStatus();
  else if (matchList) result = service.listReplayMatches();
  else if (matchDetail) result = service.getReplayMatch(params[2]);
  else if (tracking) {
    for (const field of ["period", "fromSec", "toSec", "offset", "limit"]) if (query[field] !== undefined) {
      requireValue(query[field].trim() !== "" && Number.isFinite(Number(query[field])) && Number(query[field]) >= 0, "Tracking bounds must be nonnegative finite numbers.");
      query[field] = Number(query[field]);
    }
    requireValue(query.period === undefined || Number.isInteger(query.period) && query.period >= 1 && query.period <= 4, "Invalid period.");
    requireValue(query.toSec === undefined || query.fromSec === undefined || query.toSec >= query.fromSec, "Invalid time range.");
    result = service.getReplayTracking(params[2], query);
  }
  else if (lineup) result = service.getSubstitutionLineup(params[2]);
  else if (moments) {
    if (query.playerId !== undefined) required("playerId");
    requireValue(query.limit === undefined || /^(?:[1-9]|10)$/.test(query.limit), "limit must be an integer from 1 to 10.");
    result = service.getRecommendedMoments(params[2], { ...query, limit: Number(query.limit ?? 5) });
  } else if (candidates) { required("matchId", "replacePlayerId"); result = service.getReplacementCandidates(query); }
  else if (scouting) { required("candidateId"); result = await service.getCandidateAssessment(query); }
  else if (config) result = service.getRecommendationConfig();
  else if (collection) {
    if (request.method === "POST") { result = await service.createSavedScenario(await body(request)); status = 201; }
    else result = (await service.listSavedScenarios()).filter((row) => (!query.matchId || row.matchId === query.matchId)
      && (!query.candidateId || row.candidatePlayerId === query.candidateId || row.replacements?.some((r) => r.candidatePlayerId === query.candidateId)));
  } else if (resource) {
    if (request.method === "GET") result = await service.getSavedScenario(params[2]);
    else if (request.method === "DELETE") result = await service.deleteSavedScenario(params[2]);
    else {
      const input = await body(request);
      if (request.method === "PUT") requireValue(Object.keys(input).length === (input.replacements ? 5 : 6), "PUT requires the complete scenario fields; use PATCH for partial updates.");
      result = await service.updateSavedScenario(params[2], input);
    }
  } else if (params[3] === "findings") result = await service.getSavedScenarioFindings(params[2]);
  else {
    if (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0"
      || request.headers["transfer-encoding"]) requireValue(Object.keys(await body(request)).length === 0, "This operation accepts only an empty object; update the saved scenario first.");
    if (params[3] === "simulate") result = await service.simulateSavedScenario(params[2]);
    else { result = await service.duplicateSavedScenario(params[2]); status = 201; }
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify({ data: result }));
  return true;
}
