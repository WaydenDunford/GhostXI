import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { buildBehaviorProfiles } from "../src/ai/profiles.js";

const read = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
const [history, external] = await Promise.all([read("behavior-history.json"), read("external-football.json")]);
const started = performance.now();
const model = buildBehaviorProfiles({ history, external });
model.fittingMilliseconds = Math.round((performance.now() - started) * 1000) / 1000;
model.downloadAndPreparationSeconds = history.downloadAndPreparationSeconds;
model.sourceFiles = history.matches.flatMap(({ sources }) => sources);
const directory = new URL("../src/data/ai/", import.meta.url);
await mkdir(directory, { recursive: true });
const temporary = new URL(`profiles.${process.pid}.tmp`, directory);
try {
  await writeFile(temporary, JSON.stringify(model, null, 2) + "\n");
  await rename(temporary, new URL("profiles.json", directory));
} finally { await rm(temporary, { force: true }); }
console.log(JSON.stringify({ fittingMilliseconds: model.fittingMilliseconds,
  downloadAndPreparationSeconds: model.downloadAndPreparationSeconds,
  profiles: model.profiles.map(({ name, sample, validation }) => ({ name, sample, validation })) }, null, 2));
