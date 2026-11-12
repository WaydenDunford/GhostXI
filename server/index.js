import { fileURLToPath } from "node:url";
import { createApiServer } from "./app.js";
import { createUploadHandler } from "./club-uploads.js";
import { loadFootballService } from "./service.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
const allowedOrigins = (process.env.CORS_ORIGINS
  ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8787,http://127.0.0.1:8787")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
for (const origin of allowedOrigins) {
  const parsed = new URL(origin);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error("CORS_ORIGINS must contain exact HTTP(S) origins without paths or trailing slashes.");
  }
}
// Club uploads add matches at runtime: the proxy always forwards to the latest
// loaded service, so an import only has to reload and swap it.
let current = await loadFootballService();
const service = new Proxy({}, { get: (_target, key) => current[key] });
// Uploads need a key (GHOSTXI_UPLOAD_TOKEN). Keyless uploads are an explicit opt-in
// (GHOSTXI_ALLOW_LOCAL_UPLOADS=1, set by scripts/run-app.js) and only for a loopback API.
const uploadToken = process.env.GHOSTXI_UPLOAD_TOKEN || null;
const allowLocal = process.env.GHOSTXI_ALLOW_LOCAL_UPLOADS === "1" && ["127.0.0.1", "::1", "localhost"].includes(host);
const uploads = createUploadHandler({ directory: fileURLToPath(new URL("../data/uploads/", import.meta.url)), service,
  token: uploadToken, allowLocal, reload: async () => { current = await loadFootballService(); } });
if (!uploadToken && !allowLocal) console.warn("Club uploads are disabled: set GHOSTXI_UPLOAD_TOKEN, or start with npm run dev for local-only uploads.");
const server = createApiServer({ service, allowedOrigins, uploads });
server.on("error", (error) => { console.error(`GhostXI API could not start: ${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`GhostXI API ready at http://${host}:${port}/api/v1`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
