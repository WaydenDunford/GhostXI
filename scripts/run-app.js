import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const apiPort = Number(process.env.GHOSTXI_API_PORT ?? 8787);
const frontendPort = Number(process.env.GHOSTXI_FRONTEND_PORT ?? 5173);
for (const port of [apiPort, frontendPort]) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('App ports must be integers from 1 to 65535.');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function launch(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {cwd, env:{...process.env,...env}, stdio:'inherit', windowsHide:true});
  children.push(child);
  child.on('error', error => {console.error(error.message);stop(1);});
  child.on('exit', code => {if (!stopping) stop(code ?? 1);});
  return child;
}
async function ready() {
  try {const res=await fetch(`http://127.0.0.1:${apiPort}/health`, {signal:AbortSignal.timeout(1000)}); const body=await res.json(); return res.ok && body.data?.schemaVersion === '1.0' && body.data?.dataReady === true;}
  catch {return false;}
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>stop());
if (!await ready()) {
  launch(['server/index.js'],root,{
    HOST:'127.0.0.1',PORT:String(apiPort),
    // Keyless club uploads are safe here only because this launcher binds both servers to 127.0.0.1.
    GHOSTXI_ALLOW_LOCAL_UPLOADS: process.env.GHOSTXI_ALLOW_LOCAL_UPLOADS ?? '1',
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? [
      `http://127.0.0.1:${frontendPort}`, `http://localhost:${frontendPort}`,
      `http://127.0.0.1:${apiPort}`, `http://localhost:${apiPort}`,
    ].join(','),
  });
  for (let attempt=0;attempt<100&&!stopping&&!await ready();attempt++) await new Promise(r=>setTimeout(r,200));
  if (!await ready()) {stop(1);throw new Error('The GhostXI API did not become ready. Check the prepared datasets and API port.');}
} else console.log(`Using existing GhostXI API on 127.0.0.1:${apiPort}`);
const frontend = resolve(root,'frontend');
const entry = production ? '.output/server/index.mjs' : 'node_modules/vite/bin/vite.js';
if (!existsSync(resolve(frontend,entry))) {stop(1);throw new Error(production ? 'Build the frontend with npm run build:frontend first.' : 'Install the frontend with npm run install:frontend first.');}
launch(production ? [entry] : [entry,'--host','127.0.0.1','--port',String(frontendPort),'--strictPort'],frontend,{
  HOST:'127.0.0.1',PORT:String(frontendPort),NITRO_HOST:'127.0.0.1',NITRO_PORT:String(frontendPort),
  GHOSTXI_API_TARGET:`http://127.0.0.1:${apiPort}`,
});
console.log(`GhostXI · Lovable frontend: http://127.0.0.1:${frontendPort}/match-lab`);
