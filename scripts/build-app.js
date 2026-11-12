import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const [cwd, args] of [[root,['scripts/build.js']], [new URL('../frontend/',import.meta.url),['node_modules/vite/bin/vite.js','build']]]) {
  const run = spawnSync(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
