import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, access, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateReplay, metricaReplay } from "../src/data/replay.js";
import { simulateGhostBranch } from "../src/simulation/multi-ghost.js";
import { frameAtTime, createReplayClock } from "../src/replay/controller.js";
import { createFootballService, loadFootballService } from "../server/service.js";
import { createApiServer } from "../server/app.js";
import { createGhostXIClient } from "../src/client/ghostxi.js";
import { createScenarioStore } from "../server/scenario-store.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const recording = JSON.parse(await readFile(new URL("../src/data/metrica-game1.json", import.meta.url)));
const grid = await readFile(new URL("../src/data/fot/EPV_grid.csv", import.meta.url), "utf8");
const copied = (value) => structuredClone(value);

test("source normalization preserves real coordinates, roster IDs, periods and tracking gaps", () => {
  const match = metricaReplay(recording), snapshot = copied(match), quality = validateReplay(match);
  assert.equal(quality.playable, true); assert.equal(quality.segments.length, 3); assert.equal(quality.frameCount, 603);
  assert.equal(quality.gaps.length, 2); assert.equal(quality.missingBall, 0);
  for (const [index, frame] of match.frames.entries()) {
    const original = recording.moments.flatMap((m) => m.frames)[index];
    assert.equal(frame.ball.x, original.ball.x / 105 * 100); assert.equal(frame.ball.y, original.ball.y / 68 * 100);
    for (const id of Object.keys(original.players)) assert.equal(frame.players[id].x, original.players[id].x / 105 * 100);
  }
  assert.deepEqual(match, snapshot);
  const bad = copied(match); bad.frames[0].players.unknown = {x: 50, y: 50}; assert.throws(() => validateReplay(bad), /Coordinates/);
  const time = copied(match); time.frames[1].periodTimeSec = time.frames[0].periodTimeSec; assert.throws(() => validateReplay(time), /increase/);
  const outside = copied(match); outside.frames[0].ball.x = 101; assert.throws(() => validateReplay(outside), /Coordinates/);
  const missing = copied(match); for (const frame of missing.frames) frame.players.Player2 = null;
  assert.equal(validateReplay(missing).playable, false); assert.equal(missing.frames[0].players.Player2, null);
});

test("unsupported Bosnia metadata is excluded by the same tracking eligibility gate", () => {
  const copy = copied(recording); copy.name = "Bosnia — Ermedin Demirović / Haris Tabaković / Jovo Lukić / Matej Deket";
  const service = createFootballService({recording: copy, grid});
  assert.deepEqual(service.listReplayMatches(), []);
  assert.equal(service.getDatasetStatus().providers[0].validationStatus, "excluded_unverified_bosnia");
  assert.throws(() => service.getReplayMatch(copy.id), /No validated/);
});

test("joint ghosts integrate independently, preserve team size and immutable original source frames", () => {
  const frames = copied(recording.moments[0].frames), snapshot = copied(frames);
  const replacements = [{originalPlayerId:"Player2",candidatePlayerId:"statsbomb:30714"},{originalPlayerId:"Player3",candidatePlayerId:"statsbomb:3009"}];
  const common = {frames, pitch:recording.pitch, anchors:{Player2:recording.moments[0].anchor},
    cueTimeSec:frames.find((f)=>f.sourceFrame===recording.moments[0].action.startFrame).time, seed:42};
  const first = simulateGhostBranch({...common,replacements:[replacements[0]]});
  const second = simulateGhostBranch({...common,replacements:[replacements[1]]});
  const combined = simulateGhostBranch({...common,replacements});
  assert.deepEqual(combined, simulateGhostBranch({...common,replacements})); assert.deepEqual(frames,snapshot);
  assert.ok(combined.coupling.separationEffort > 0);
  assert.ok(combined.frames.some((frame,i) => JSON.stringify(frame.players[replacements[0].candidatePlayerId]) !== JSON.stringify(first.frames[i].players[replacements[0].candidatePlayerId])));
  for (const run of [first,second,combined]) {
    assert.equal(run.frames.length,201); assert.ok(run.frames.every((f)=>Object.keys(f.players).length===22));
    assert.deepEqual(run.frames.map((f)=>f.ball),frames.map((f)=>f.ball));
  }
  for (const r of replacements) assert.deepEqual(combined.frames[0].players[r.candidatePlayerId],frames[0].players[r.originalPlayerId]);
  for (const invalid of [[replacements[0],replacements[0]], [replacements[0],{...replacements[1],candidatePlayerId:replacements[0].candidatePlayerId}], [{...replacements[0],candidatePlayerId:"Player8"}]]) {
    assert.throws(()=>simulateGhostBranch({...common,replacements:invalid}),/Duplicate/);
  }
});

test("replay seeking never interpolates gaps and clock supports speed, seek and pause", () => {
  const frames=[{timeSec:0},{timeSec:.04},{timeSec:2}];
  assert.equal(frameAtTime(frames,1,25),null); assert.equal(frameAtTime(frames,.04,25),frames[1]);
  let callback, latest; const clock=createReplayClock({durationSec:8,onTime:(t)=>latest=t,requestFrame:(fn)=>{callback=fn;return 1;},cancelFrame:()=>{callback=null;}});
  clock.setSpeed(2); clock.play(); callback(0); callback(1000); assert.equal(latest,2);
  clock.pause(); assert.equal(clock.playing,false); clock.seek(4); assert.equal(latest,4); clock.destroy();
});

test("PFF missing files fail clearly before loader execution", async () => {
  const directory=await mkdtemp(join(root,"work","pff-missing-")); const manifest=join(directory,"manifest.json");
  await writeFile(manifest,JSON.stringify({gameId:"10517",metadata:"absent-meta.json",roster:"absent-roster.json",tracking:"absent.jsonl.bz2"}));
  try { const run=spawnSync("python",["scripts/prepare-pff.py","--manifest",manifest,"--output",join(directory,"output.json")],{cwd:root,encoding:"utf8"});
    assert.equal(run.status,1); assert.match(run.stderr,/Missing PFF files/); await assert.rejects(access(join(directory,"output.json")));
  } finally { await unlink(manifest); await rmdir(directory); }
});

test("actual PFF/Kloppy public excerpt parses with verified roster, timestamps, estimated coordinates and explicit missing values", async (t) => {
  const file=join(root,"src/data/pff/10517.json");
  try {await access(file);} catch {t.skip("Optional PFF parser excerpt has not been imported.");return;}
  const directory=await mkdtemp(join(root,"work","pff-parse-")), output=join(directory,"parsed.json");
  const python=join(root,"work/pff-venv/Scripts/python.exe");
  const compressed=join(directory,"actual-source.jsonl.bz2"), manifest=join(directory,"manifest.json");
  try {
    const run=spawnSync(python,["scripts/prepare-pff.py","--manifest","work/datasets/pff-kloppy-tests/manifest.json","--output",output],{cwd:root,encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(await readFile(output,"utf8")).frames.length,200);
    const base=join(root,"work/datasets/pff-kloppy-tests");
    const compression=spawnSync(python,["-c","import bz2,sys; from pathlib import Path; Path(sys.argv[2]).write_bytes(bz2.compress(Path(sys.argv[1]).read_bytes()))",join(base,"pff_10517.jsonl"),compressed],{encoding:"utf8"});
    assert.equal(compression.status,0,compression.stderr);
    await writeFile(manifest,JSON.stringify({gameId:"10517",metadata:join(base,"pff_metadata_10517.json"),roster:join(base,"pff_rosters_10517.json"),tracking:compressed}));
    const zipped=spawnSync(python,["scripts/prepare-pff.py","--manifest",manifest,"--output",output],{cwd:root,encoding:"utf8"});
    assert.equal(zipped.status,0,zipped.stderr); assert.equal(JSON.parse(await readFile(output,"utf8")).frames.length,200);
  } finally { for(const path of [output,compressed,manifest]) {try {await unlink(path);} catch(e) {if(e.code!=="ENOENT")throw e;}} await rmdir(directory); }
  const match=JSON.parse(await readFile(file,"utf8")); assert.equal(match.id,"pff:10517"); assert.equal(match.frames.length,200);
  const quality=validateReplay(match); assert.equal(quality.playable,false); assert.ok(quality.gaps.length>0);
  assert.equal(match.frames[0].sourceFrame,4630); assert.equal(match.frames[0].periodTimeSec,.000821);
  assert.equal(match.players.find((p)=>p.id==="pff:10715").name,"Julian Alvarez");
  assert.equal(match.players.find((p)=>p.id==="pff:10715").teamId,"pff:364");
  assert.ok(Math.abs(match.frames[0].players["pff:10715"].x-54.7495238095238)<1e-8);
  assert.equal(match.frames[0].dataStatus,"ESTIMATED"); assert.ok(Object.values(match.frames[0].players).includes(null));
  assert.equal(match.eventAlignment.verified,false); assert.equal(match.score,null);
  assert.ok(match.source.files.every((f)=>/^[a-f0-9]{64}$/.test(f.sha256)));
});

test("HTTP acceptance: verified catalog -> two replacements -> saved/reopened independent branches -> coaching/scouting", async () => {
  const directory=await mkdtemp(join(root,"work","verified-test-")), file=join(directory,"scenarios.json");
  const service=await loadFootballService({scenarioFile:file}), server=createApiServer({service,allowedOrigins:["http://localhost:5173"]});
  server.listen(0,"127.0.0.1"); await once(server,"listening"); const origin=`http://127.0.0.1:${server.address().port}`;
  const api=createGhostXIClient({baseUrl:origin+"/api/v1"});
  try {
    const matches=await api.getReplayMatches(); assert.ok(matches.some((m)=>m.id === "metrica-game-1")); assert.ok(matches.every((m)=>m.playable));
    const status=await api.getDatasetStatus(); assert.equal(status.verifiedDataOnly,true);
    const modelConfig=await api.getRecommendationConfig(); assert.equal(modelConfig.modeledPhysical.maxSpeedMps,5.4);
    assert.ok(status.providers.some((p)=>p.provider==="pff"&&!p.playable));
    assert.ok(status.providers.filter((p)=>p.provider==="statsbomb").every((p)=>!p.playable));
    for (const id of ["statsbomb:3943043","pff:10517","bosnia-demo"]) {
      await assert.rejects(api.getReplayMatch(id),(e)=>e.status===404); await assert.rejects(api.getReplayTracking(id),(e)=>e.status===404);
      await assert.rejects(api.getRecommendedMoments(id,{playerId:"statsbomb:6765"}),(e)=>e.status===404);
    }
    const matchId=matches[0].id, lineup=await api.getLineup(matchId); assert.equal(lineup.players.length,22);
    const moments=await api.getRecommendedMoments(matchId,{playerId:"Player2",limit:5}); assert.equal(moments.length,3);
    assert.ok(moments.every((m)=>m.dataStatus==="observed"));
    const tracking=await api.getReplayTracking(matchId,{momentId:"home-wide-interception",limit:2000}); assert.equal(tracking.frames.length,201);
    const candidates=await api.getReplacementCandidates({matchId,replacePlayerId:"Player2"});
    assert.ok(candidates.every((p)=>p.provenance&&p.attributes.sprintSpeed===null&&p.ageAtHistoricalMatch===null));
    const input={sportId:"football",matchId,momentId:"home-wide-interception",seed:42,replacements:[{originalPlayerId:"Player2",candidatePlayerId:"statsbomb:30714"},{originalPlayerId:"Player3",candidatePlayerId:"statsbomb:3009"}]};
    const scenario=await api.createSavedScenario(input), result=await api.simulateSavedScenario(scenario.id);
    assert.equal(result.originalDataStatus,"OBSERVED"); assert.equal(result.branches.length,3); assert.equal(result.branches[2].id,"combined");
    assert.deepEqual(await api.simulateSavedScenario(scenario.id),result);
    for (const branch of result.branches) assert.ok(branch.frames.every((f)=>Object.keys(f.players).length===22));
    assert.equal(result.originalFrames[0].ball.x,tracking.frames[0].ball.x);
    for (const branch of result.branches) for (const f of branch.frames) for (const p of [f.ball,...Object.values(f.players)]) assert.ok(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);
    const findings=await api.getSavedScenarioFindings(scenario.id); assert.equal(findings.findings.length,10); assert.ok(findings.evidence.recordedFacts.source);
    assert.ok(findings.findings.some((f)=>f.branchId==="combined"&&f.metricId==="minGhostSeparationM"));
    const duplicate=await api.duplicateSavedScenario(scenario.id); assert.notEqual(duplicate.id,scenario.id);
    assert.equal((await api.getCandidateAssessment({candidateId:"statsbomb:30714",matchId})).groups[0].scenarioCount,1);
    assert.deepEqual(await createScenarioStore({filePath:file}).get(scenario.id),scenario);
    await api.updateSavedScenario(duplicate.id,{seed:99}); assert.equal((await api.getSavedScenario(duplicate.id)).seed,99);
    await api.deleteSavedScenario(duplicate.id); assert.equal((await api.listSavedScenarios({matchId})).length,1);
    assert.equal((await api.listSavedScenarios({candidateId:"statsbomb:30714"})).length,1);
    const single=await api.createSavedScenario({sportId:"football",matchId,momentId:"home-wide-interception",seed:42,originalPlayerId:"Player2",candidatePlayerId:"statsbomb:30714"});
    assert.equal((await api.simulateSavedScenario(single.id)).branches.length,1); await api.deleteSavedScenario(single.id);
    await assert.rejects(api.createSavedScenario({...input,matchId:"statsbomb:3943043"}),(e)=>e.status===404);
    for (const replacements of [[input.replacements[0],input.replacements[0]],[{originalPlayerId:"Player2",candidatePlayerId:"lane-reader"}],[{originalPlayerId:"Player2",candidatePlayerId:"transfermarkt:433177"}],[{originalPlayerId:"Rodri",candidatePlayerId:"statsbomb:30714"}]]) {
      await assert.rejects(api.createSavedScenario({...input,replacements}),(e)=>e.status===400||e.status===404);
    }
    assert.equal((await fetch(origin+"/api/matches/metrica-game-1/tracking?period=1.2")).status,400);
    assert.equal((await fetch(origin+"/api/matches/metrica-game-1/tracking?fromSec=5&toSec=2")).status,400);
    assert.equal((await fetch(origin+"/api/scenarios",{method:"POST",headers:{"Content-Type":"application/json"},body:"{"})).status,400);
    assert.equal((await fetch(origin+"/src/data/external-football.json")).status,404);
    assert.equal((await fetch(origin+"/")).status,200);
    assert.equal((await fetch(origin+"/src/ui/scoutingCard.js")).status,200);
  } finally { await new Promise((resolve)=>server.close(resolve)); await unlink(file); await rmdir(directory); }
});
