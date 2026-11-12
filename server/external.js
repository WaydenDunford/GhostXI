import { DomainError, requireValue } from "../src/domain/validation.js";
import { normalizeStatsBombMatch } from "../src/data/statsbomb.js";

const clone = (value) => structuredClone(value);
const normalizedName = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function validDate(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Use a valid ISO date (YYYY-MM-DD).");
  return value;
}

export function ageOnDate(birth, asOf) {
  if (!birth || birth > asOf) return null;
  return Number(asOf.slice(0, 4)) - Number(birth.slice(0, 4)) - Number(asOf.slice(5) < birth.slice(5));
}

export function valuationAtDate(history, asOf) {
  const eligible = history.filter(({ date }) => date <= asOf);
  if (!eligible.length) return { asOf, date: null, valueEur: null, status: "missing" };
  const latestDate = eligible.at(-1).date;
  const values = [...new Set(eligible.filter(({ date }) => date === latestDate).map(({ valueEur }) => valueEur))];
  return { asOf, date: latestDate, valueEur: values.length === 1 ? values[0] : null,
    status: values.length === 1 ? "known" : "conflicting source values" };
}

export function createExternalService(bundle = null) {
  const ready = bundle !== null;
  const matches = new Map();
  const players = new Map();
  const links = new Map();
  if (ready) {
    requireValue(bundle.schemaVersion === "1.0" && Array.isArray(bundle.statsbomb?.matches)
      && Array.isArray(bundle.transfermarkt?.players) && Array.isArray(bundle.playerLinks), "External dataset cache has an unsupported schema.");
    for (const raw of bundle.statsbomb.matches) {
      const match = normalizeStatsBombMatch(raw);
      requireValue(!matches.has(match.id), "Duplicate StatsBomb match ID.");
      matches.set(match.id, match);
    }
    for (const player of bundle.transfermarkt.players) {
      requireValue(typeof player.providerId === "string" && /^\d+$/.test(player.providerId)
        && !players.has(player.providerId) && Array.isArray(player.valuations), "Invalid or duplicate Transfermarkt player.");
      if (player.dateOfBirth !== null) validDate(player.dateOfBirth);
      let previous = "";
      for (const valuation of player.valuations) {
        validDate(valuation.date);
        requireValue(valuation.date >= previous && Number.isFinite(valuation.valueEur) && valuation.valueEur >= 0, "Valuations must be dated, nonnegative and chronological.");
        previous = valuation.date;
      }
      players.set(player.providerId, player);
    }
    const usedTM = new Set();
    for (const link of bundle.playerLinks) {
      const tm = players.get(link.transfermarktId);
      const sb = [...matches.values()].flatMap(({ players }) => players).filter(({ providerId }) => providerId === link.statsbombId);
      requireValue(tm && tm.name === link.transfermarktName && tm.dateOfBirth === link.dateOfBirth && tm.country === link.country
        && sb.length > 0 && sb.every((player) => player.fullName === link.statsbombName && player.country === link.country)
        && !links.has(link.statsbombId) && !usedTM.has(link.transfermarktId), "Curated cross-provider ID mapping does not match source records.");
      links.set(link.statsbombId, link);
      usedTM.add(link.transfermarktId);
    }
  }
  const statsbombSource = { id: "statsbomb", name: "StatsBomb Open Data", url: "https://github.com/hudl/open-data",
    revision: bundle?.statsbomb?.revision ?? null, ready, matchCount: matches.size,
    attribution: "Data: StatsBomb. Show the supplied StatsBomb logo when publishing analysis.",
    logoPath: "/api/v1/datasets/statsbomb/logo", mediaPack: "https://statsbomb.com/media-pack/",
    licenseUrl: "https://github.com/hudl/open-data/blob/master/LICENSE.pdf",
    limitations: ["Event observations, not continuous 22-player tracking.", "No link to anonymous Metrica identities or physical movement traits."] };
  const transfermarktSource = { id: "transfermarkt", name: "Transfermarkt datasets (dcaribou)", ready,
    url: "https://github.com/dcaribou/transfermarkt-datasets", mirror: "https://www.kaggle.com/datasets/davidcariboo/player-scores",
    license: "CC0-1.0", kaggleVersion: bundle?.transfermarkt?.kaggleVersion ?? null,
    declaredCoverageEnd: bundle?.transfermarkt?.declaredCoverageEnd ?? null,
    latestValuationDate: bundle?.transfermarkt?.latestValuationDate ?? null,
    playerCount: players.size, curatedPlayerLinkCount: links.size,
    limitations: ["Historical snapshot; updates paused in July 2026.", "Market value is an estimate, not a transfer fee or a performance score.",
      "Club and position fields describe the source snapshot, not necessarily the historical match date.", "Only the explicit ID crosswalk links StatsBomb players; others remain unlinked."] };
  function requireReady() {
    if (!ready) throw new DomainError("Run npm run prepare:external to prepare StatsBomb and Transfermarkt data.", "EXTERNAL_DATA_NOT_READY", 503);
  }
  function eventMatch(id) {
    requireReady();
    const key = String(id).startsWith("statsbomb:") ? String(id) : `statsbomb:${id}`;
    const result = matches.get(key);
    if (!result) throw new DomainError("StatsBomb match not found.", "MATCH_NOT_FOUND", 404);
    return result;
  }
  function marketPlayer(id) {
    requireReady();
    const key = String(id).replace(/^transfermarkt:/, "");
    const result = players.get(key);
    if (!result) throw new DomainError("Transfermarkt player not found.", "PLAYER_NOT_FOUND", 404);
    return result;
  }
  function profile(player, asOf, includeHistory = false) {
    const { valuations, ...details } = player;
    return { ...details, ageAtReferenceDate: ageOnDate(player.dateOfBirth, asOf), referenceDate: asOf,
      marketValue: valuationAtDate(valuations, asOf),
      ...(includeHistory ? { valuations: valuations.filter(({ date }) => date <= asOf) } : {}),
      dataKind: "OBSERVED metadata / ESTIMATED market value", simulationEligible: false };
  }
  const summary = ({ events, players, momentum, keyMoments, ...match }) => ({ ...match,
    eventCount: events.length, playerCount: players.length, source: statsbombSource });
  function integer(value, fallback, min, max) {
    if (value === undefined) return fallback;
    requireValue(/^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max,
      `Expected an integer between ${min} and ${max}.`);
    return Number(value);
  }
  return {
    getExternalDatasets: () => clone({ preparedAt: bundle?.preparedAt ?? null,
      statsbomb: statsbombSource, transfermarkt: transfermarktSource, files: bundle?.files ?? [] }),
    getEventMatches() { requireReady(); return clone([...matches.values()].map(summary)); },
    getEventMatch(id) {
      const match = eventMatch(id);
      return clone({ ...summary(match), keyMoments: match.keyMoments, statsMethod: match.statsMethod });
    },
    getEventMomentum(id) { return clone({ matchId: eventMatch(id).id, ...eventMatch(id).momentum, source: statsbombSource }); },
    getEventPlayers(id) {
      const match = eventMatch(id);
      return clone(match.players.map((player) => {
        const link = links.get(player.providerId);
        return { ...player, marketLink: link ? { status: "curated", method: "Explicit source-ID crosswalk, checked against expected source names, country and Transfermarkt birth date; no fuzzy matching.",
          statsbombId: player.providerId, transfermarktId: link.transfermarktId, source: "config/external-sources.json",
          profile: profile(marketPlayer(link.transfermarktId), match.date) } : { status: "unlinked", profile: null },
        source: statsbombSource };
      }));
    },
    getEventList(id, query = {}) {
      const match = eventMatch(id);
      const limit = integer(query.limit, 100, 1, 500);
      const offset = integer(query.offset, 0, 0, 100000);
      const teamId = query.teamId === undefined ? undefined : integer(query.teamId, undefined, 1, 1000000);
      const playerId = query.playerId === undefined ? undefined : integer(query.playerId, undefined, 1, 10000000);
      const filtered = match.events.filter((event) => (query.type === undefined || event.type === query.type)
        && (teamId === undefined || event.teamId === teamId) && (playerId === undefined || event.playerId === playerId));
      return clone({ matchId: match.id, total: filtered.length, limit, offset, items: filtered.slice(offset, offset + limit), source: statsbombSource });
    },
    getMarketPlayers(query = {}) {
      requireReady();
      const asOf = validDate(query.asOf ?? bundle.transfermarkt.declaredCoverageEnd);
      const limit = integer(query.limit, 50, 1, 200);
      const offset = integer(query.offset, 0, 0, 1000000);
      const minAge = integer(query.minAge, 0, 0, 120);
      const maxAge = integer(query.maxAge, 120, 0, 120);
      requireValue(minAge <= maxAge, "minAge cannot exceed maxAge.");
      requireValue(query.search === undefined || query.search.length <= 100, "Search text is too long.");
      const search = normalizedName(query.search ?? "");
      const selected = [...players.values()].filter((player) => {
        const age = ageOnDate(player.dateOfBirth, asOf);
        return normalizedName(player.name).includes(search) && (!query.country || player.country === query.country)
          && (!query.position || player.position === query.position)
          && ((query.minAge === undefined && query.maxAge === undefined) || (age !== null && age >= minAge && age <= maxAge));
      }).sort((a, b) => Number(a.providerId) - Number(b.providerId));
      return clone({ total: selected.length, limit, offset, referenceDate: asOf,
        items: selected.slice(offset, offset + limit).map((player) => profile(player, asOf)), source: transfermarktSource });
    },
    getMarketPlayer(id, asOf) {
      const player = marketPlayer(id);
      return clone({ ...profile(player, validDate(asOf ?? bundle.transfermarkt.declaredCoverageEnd), true), source: transfermarktSource });
    },
  };
}
