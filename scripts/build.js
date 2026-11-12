import { mkdir, copyFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

// Syntax validation and a static UI bundle. Raw tracking/profile data is never
// copied into the public build. Production playback still requires the Node API.
async function check(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path=join(directory,entry.name);
    if (entry.isDirectory()) await check(path);
    else if (path.endsWith(".js")) {
      const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
      if (result.status!==0) throw new Error(result.stderr);
    }
  }
}
await check("src"); await check("server");
const files=["index.html","src/main.js","src/ui/verified-dashboard.js","src/ui/dashboard.js","src/ui/pitch.js","src/ui/ui.css","src/client/ghostxi.js","src/replay/controller.js"];
for (const file of files) { const target=join("dist/public",file); await mkdir(dirname(target),{recursive:true}); await copyFile(file,target); }
console.log(`Validated source syntax; built ${files.length} public UI assets. API/source datasets are separate; no private source files bundled.`);
