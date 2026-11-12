export class GhostXIApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "GhostXIApiError";
    this.code = code;
    this.status = status;
  }
}

/** Standalone browser client: copy this file and its .d.ts into the Lovable project. */
export function createGhostXIClient({ baseUrl = "http://127.0.0.1:8787/api/v1", fetchImpl = globalThis.fetch } = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  const substitutionBase = base.replace(/\/api\/v1$/, "/api");
  const segment = encodeURIComponent;
  const queryString = (query = {}) => {
    const encoded = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    return encoded.size ? `?${encoded}` : "";
  };
  async function request(path, { signal, body, method } = {}, apiBase = base) {
    const response = await fetchImpl(`${apiBase}${path}`, { signal, method: method ?? (body === undefined ? "GET" : "POST"),
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    let payload;
    try { payload = await response.json(); }
    catch { throw new GhostXIApiError("Backend returned a non-JSON response. Check the API URL.", "INVALID_RESPONSE", response.status); }
    if (!response.ok) throw new GhostXIApiError(payload.error?.message ?? "GhostXI request failed.", payload.error?.code ?? "REQUEST_FAILED", response.status);
    if (!payload || !Object.hasOwn(payload, "data")) throw new GhostXIApiError("Backend response has no data field.", "INVALID_RESPONSE", response.status);
    return payload.data;
  }
  return {
    getDatasetStatus: (options) => request("/datasets/status", options, substitutionBase),
    getReplayMatches: (options) => request("/matches", options, substitutionBase),
    getReplayMatch: (id, options) => request(`/matches/${segment(id)}`, options, substitutionBase),
    getReplayTracking: (id, query, options) => request(`/matches/${segment(id)}/tracking${queryString(query)}`, options, substitutionBase),
    getMatches: (options) => request("/matches", options),
    getLineup: (matchId, options) => request(`/matches/${segment(matchId)}/lineup`, options, substitutionBase),
    getRecommendedMoments: (matchId, query, options) => request(`/matches/${segment(matchId)}/moments${queryString(query)}`, options, substitutionBase),
    getReplacementCandidates: (query, options) => request(`/candidates${queryString(query)}`, options, substitutionBase),
    getRecommendationConfig: (options) => request("/recommendation/config", options, substitutionBase),
    listSavedScenarios: (query, options) => request(`/scenarios${queryString(query)}`, options, substitutionBase),
    getSavedScenario: (id, options) => request(`/scenarios/${segment(id)}`, options, substitutionBase),
    createSavedScenario: (input, options) => request("/scenarios", { ...options, body: input }, substitutionBase),
    updateSavedScenario: (id, input, options) => request(`/scenarios/${segment(id)}`, { ...options, body: input, method: "PATCH" }, substitutionBase),
    deleteSavedScenario: (id, options) => request(`/scenarios/${segment(id)}`, { ...options, method: "DELETE" }, substitutionBase),
    duplicateSavedScenario: (id, options) => request(`/scenarios/${segment(id)}/duplicate`, { ...options, body: {} }, substitutionBase),
    simulateSavedScenario: (id, options) => request(`/scenarios/${segment(id)}/simulate`, { ...options, body: {} }, substitutionBase),
    getSavedScenarioFindings: (id, options) => request(`/scenarios/${segment(id)}/findings`, options, substitutionBase),
    getCandidateAssessment: (query, options) => request(`/scouting${queryString(query)}`, options, substitutionBase),
    getCoachingReport: (query, options) => request(`/coach${queryString(query)}`, options, substitutionBase),
    getMatch: (matchId, options) => request(`/matches/${segment(matchId)}`, options),
    getScenario: (matchId, momentId, options) => request(`/matches/${segment(matchId)}/scenarios/${segment(momentId)}`, options),
    getCandidates: (matchId, momentId, options) => request(`/matches/${segment(matchId)}/candidates${momentId === undefined ? "" : `?momentId=${segment(momentId)}`}`, options),
    getMomentum: (matchId, options) => request(`/matches/${segment(matchId)}/momentum`, options),
    compare: (input, options) => request("/comparisons", { ...options, body: input }),
    getScouting: (matchId, candidateId, options) => request(`/matches/${segment(matchId)}/scouting?candidateId=${segment(candidateId)}`, options),
    getMethodology: (options) => request("/methodology", options),
    getDatasets: (options) => request("/datasets", options),
    getBehaviorStatus: (options) => request("/ai/status", options),
    getBehaviorProfiles: (options) => request("/ai/profiles", options),
    getBehaviorProfile: (playerId, options) => request(`/ai/profiles/${segment(playerId)}`, options),
    getBehaviorScenarios: (options) => request("/ai/scenarios", options),
    runBehaviorSimulation: (input, options) => request("/ai/simulations", { ...options, body: input }),
    getEventMatches: (options) => request("/statsbomb/matches", options),
    getEventMatch: (matchId, options) => request(`/statsbomb/matches/${segment(matchId)}`, options),
    getEventPlayers: (matchId, options) => request(`/statsbomb/matches/${segment(matchId)}/players`, options),
    getEventMomentum: (matchId, options) => request(`/statsbomb/matches/${segment(matchId)}/momentum`, options),
    getEvents: (matchId, query, options) => request(`/statsbomb/matches/${segment(matchId)}/events${queryString(query)}`, options),
    getMarketPlayers: (query, options) => request(`/transfermarkt/players${queryString(query)}`, options),
    getMarketPlayer: (playerId, asOf, options) => request(`/transfermarkt/players/${segment(playerId)}${queryString({ asOf })}`, options),
  };
}
