// Builds src/data/scouting-candidates.json: four real A-League Men 2024/25 candidates per tracked
// scenario, from SkillCorner's open season aggregates (MIT) and the Transfermarkt datasets (CC0).
// Needs network access once: npm run prepare:scouting
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { indexByBirthdate, linkTransfermarkt, normaliseName, parseCsv, seasonValuation } from "./scouting/sources.js";
import { dedupeGroup, measureGroup, settingsFromMeasures } from "./scouting/profile.js";
import { pickShortlists } from "./scouting/shortlist.js";

const SKILLCORNER = "https://raw.githubusercontent.com/SkillCorner/opendata/master";
const TRANSFERMARKT = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data";
const SEASON_END = "2025-06-30";
const SCENARIOS = [
  { scenarioId: "home-wide-interception", group: "Central Defender" },
  { scenarioId: "home-defensive-press", group: "Full Back" },
  { scenarioId: "home-deep-pass-attack", group: "Wide Attacker" },
];

async function download(url, gzip = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return (gzip ? gunzipSync(bytes) : bytes).toString("utf8");
}

const [physical, offBallRuns, passing, licence, tmPlayers, tmValuations, nationalTeams] = await Promise.all([
  ...["physical", "obr", "passing"].map((kind) =>
    download(`${SKILLCORNER}/data/aggregates/aus1league_${kind}aggregates_20242025.csv`).then(parseCsv)),
  download(`${SKILLCORNER}/LICENSE`),
  ...["players", "player_valuations", "national_teams"].map((table) =>
    download(`${TRANSFERMARKT}/${table}.csv.gz`, true).then(parseCsv)),
]);

const number = (value) => (value === undefined || value === null || String(value).trim() === "" ? null : Number(value));
const round = (value, digits = 2) => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const clubLabel = (team) => team.replace(/\s+Football Club$/i, " FC").trim();
const clubKey = (name) => normaliseName(name).replace(/\b(football club|fc)\b/g, " ").replace(/\s+/g, " ").trim();
function ageAt(birthdate, on) {
  const [birthYear, birthMonth, birthDay] = birthdate.split("-").map(Number);
  const [year, month, day] = on.split("-").map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
}

const tmIndex = indexByBirthdate(tmPlayers);
const valuationsByPlayer = new Map();
for (const row of tmValuations) {
  if (!valuationsByPlayer.has(row.player_id)) valuationsByPlayer.set(row.player_id, []);
  valuationsByPlayer.get(row.player_id).push(row);
}
const nationalTeamNames = new Map(nationalTeams.map((team) => [team.national_team_id, team.name]));
const keyed = (rows) => new Map(rows.map((row) => [`${row.player_id}|${row.position_group}`, row]));
const [runsByKey, passingByKey] = [keyed(offBallRuns), keyed(passing)];

const groups = SCENARIOS.map(({ scenarioId, group }) => ({ scenarioId, group, rows: dedupeGroup(physical, group) }));
const measures = new Map(groups.map(({ scenarioId, rows }) => [scenarioId, measureGroup(rows)]));
const links = new Map();
for (const { rows } of groups) {
  for (const row of rows) if (!links.has(row.player_id)) links.set(row.player_id, linkTransfermarkt(row, tmIndex));
}
const values = new Map([...links].map(([id, tm]) => [id, tm ? seasonValuation(valuationsByPlayer.get(tm.player_id) ?? []) : null]));
const picks = pickShortlists(groups, measures, values);

const candidates = groups.flatMap(({ scenarioId, group, rows }) => picks[scenarioId].map(({ playerId, pick }) => {
  const row = rows.find(({ player_id: id }) => id === playerId);
  const measured = measures.get(scenarioId).get(playerId);
  const tm = links.get(playerId);
  const runs = runsByKey.get(`${playerId}|${group}`) ?? {};
  const passes = passingByKey.get(`${playerId}|${group}`) ?? {};
  const passPercent = number(passes.pass_pct_completed);
  const club = clubLabel(row.team_name);
  const nationalTeam = nationalTeamNames.get(tm?.current_national_team_id) ?? null;
  return {
    id: `sc-${playerId}`,
    name: row.player_name.replace(/\s+/g, " ").trim(),
    club,
    clubNow: tm?.current_club_name && clubKey(tm.current_club_name) !== clubKey(club) ? tm.current_club_name : null,
    positionGroup: group,
    pick,
    age: ageAt(row.player_birthdate.slice(0, 10), SEASON_END),
    transfermarkt: tm ? {
      position: tm.position || null,
      subPosition: tm.sub_position || null,
      foot: tm.foot || null,
      heightCm: number(tm.height_in_cm),
      marketValue: values.get(playerId),
    } : null,
    measured: {
      psv99Kmh: measured.psv99Kmh,
      psv99Percentile: round(measured.psv99Percentile, 3),
      timeToSprintS: measured.timeToSprintS,
      sprintPercentile: round(measured.sprintPercentile, 3),
      oopHiPerMin: round(measured.oopHiPerMin),
      oopPercentile: round(measured.oopPercentile, 3),
      minutes: Math.round(measured.minutes),
      matches: measured.matches,
      offBallRunsPer30: round(number(runs.offballrun_count_p30tip)),
      runsInBehindPer30: round(number(runs.behindrun_count_p30tip)),
      dangerousRunsPer30: round(number(runs.offballrun_count_dangerous_p30tip)),
      passCompletion: passPercent === null ? null : round(passPercent / 100, 3),
      lineBreakingPer30: round(number(passes.pass_count_linebreak_completed_p30tip)),
    },
    filled: measured.filled,
    settings: settingsFromMeasures(measured),
    national: {
      caps: number(tm?.international_caps) ?? 0,
      goals: number(tm?.international_goals) ?? 0,
      team: nationalTeam,
      citizenship: tm?.country_of_citizenship || null,
      youthCapsPossible: nationalTeam === null,
      tournaments: [],
    },
  };
}));

const output = {
  competition: "A-League Men",
  season: "2024/25",
  sources: [
    { name: "SkillCorner Open Data", licence: "MIT", url: "https://github.com/SkillCorner/opendata" },
    { name: "Transfermarkt datasets", licence: "CC0", url: "https://github.com/dcaribou/transfermarkt-datasets" },
  ],
  shortlists: Object.fromEntries(groups.map(({ scenarioId }) => [scenarioId, picks[scenarioId].map(({ playerId }) => `sc-${playerId}`)])),
  candidates,
};

const dataDirectory = new URL("../src/data/", import.meta.url);
await mkdir(new URL("skillcorner/", dataDirectory), { recursive: true });
await writeFile(new URL("skillcorner/LICENSE", dataDirectory), licence);
const destination = new URL("scouting-candidates.json", dataDirectory);
const temporary = new URL(`scouting-candidates.${process.pid}.tmp`, dataDirectory);
try {
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`);
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}

for (const { scenarioId, group, rows } of groups) {
  const linked = rows.filter(({ player_id: id }) => links.get(id)).length;
  console.log(`\n${scenarioId} · ${group} · ${rows.length} players, ${linked} linked to Transfermarkt`);
  for (const id of output.shortlists[scenarioId]) {
    const candidate = candidates.find((entry) => entry.id === id);
    const tm = links.get(id.slice(3));
    const value = candidate.transfermarkt?.marketValue;
    console.log(`  ${candidate.pick.padEnd(15)} ${candidate.name} (${candidate.club}${candidate.clubNow ? `; now ${candidate.clubNow}` : ""}), age ${candidate.age}`
      + ` | TM: ${tm ? `${tm.name}, born ${tm.date_of_birth.slice(0, 10)}, ${candidate.transfermarkt.subPosition ?? candidate.transfermarkt.position}` : "no record"}`
      + ` | value ${value ? `€${value.eur} (${value.date}${value.older ? ", older" : ""})` : "none"} | caps ${candidate.national.caps}`
      + `\n${" ".repeat(18)}${candidate.measured.psv99Kmh} km/h, sprint ${candidate.measured.timeToSprintS ?? "median"} s, out of possession ${candidate.measured.oopHiPerMin} m/min → ${JSON.stringify(candidate.settings)}`);
  }
}
