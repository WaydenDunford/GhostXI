// Pure helpers for the scouting data pipeline: CSV parsing, name normalisation,
// SkillCorner ↔ Transfermarkt linking and the 2024/25 market value.
const SEASON = { from: "2024-07-01", to: "2025-06-30" };

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

export function normaliseName(name = "") {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/đ/g, "d").replace(/ø/g, "o").replace(/ł/g, "l").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/[^a-z]+/g, " ").trim();
}

export function indexByBirthdate(players) {
  const index = new Map();
  for (const player of players) {
    const date = player.date_of_birth?.slice(0, 10);
    if (!date) continue;
    if (!index.has(date)) index.set(date, []);
    index.get(date).push(player);
  }
  return index;
}

// Tries full name, then short name, then last name plus first initial. The first rule with one
// hit wins; a rule with several hits means the name is ambiguous, so there is no match.
export function matchByName(name, shortName, candidates, nameOf) {
  const full = normaliseName(name);
  const short = normaliseName(shortName);
  const last = (value) => value.split(" ").at(-1);
  const rules = [
    (other) => other === full,
    (other) => short !== "" && other === short,
    (other) => last(other) === last(full) && other[0] === full[0],
  ];
  for (const rule of rules) {
    const hits = candidates.filter((candidate) => rule(normaliseName(nameOf(candidate))));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

export function linkTransfermarkt(row, index) {
  const sameBirthdate = index.get(row.player_birthdate?.slice(0, 10)) ?? [];
  return matchByName(row.player_name, row.player_short_name, sameBirthdate, (player) => player.name);
}

export function seasonValuation(rows) {
  const valuations = rows
    .map((row) => ({ eur: Number(row.market_value_in_eur), date: row.date?.slice(0, 10), club: row.current_club_name }))
    .filter(({ eur, date }) => Number.isFinite(eur) && date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const inSeason = valuations.filter(({ date }) => date >= SEASON.from && date <= SEASON.to).at(-1);
  if (inSeason) return { ...inSeason, older: false };
  const before = valuations.filter(({ date }) => date < SEASON.from).at(-1);
  return before ? { ...before, older: true } : null;
}
