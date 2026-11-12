import { createApiServer } from "./app.js";
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
const service = await loadFootballService();
const server = createApiServer({ service, allowedOrigins });
server.on("error", (error) => { console.error(`GhostXI API could not start: ${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`GhostXI API ready at http://${host}:${port}/api/v1`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
